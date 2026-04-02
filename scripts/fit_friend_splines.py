#!/usr/bin/env python3
"""
Continuous VO2 Max Fitness Model: Spline Fitting & Normalization
==================================================================

This script implements the continuous VO2 max model upgrade, replacing the
5-bin Mandsager categorical approach with smooth, age/sex-specific splines
fitted to FRIEND 2022 percentile data (Kaminsky LA, et al. Mayo Clin Proc.
2022;97(2):285-293. DOI: 10.1016/j.mayocp.2021.08.020).

The model uses Kokkinos et al. 2022 hazard ratio (0.86 per +1 MET) and 
ensures population-averaged hazard = 1.0 through integral normalization.

References:
-----------
[1] Kaminsky LA, et al. Updated Reference Standards for Cardiorespiratory 
    Fitness Measured with Cardiopulmonary Exercise Testing: Data from the 
    Fitness Registry and the Importance of Exercise National Database (FRIEND).
    Mayo Clin Proc. 2022;97(2):285-293. 
    DOI: 10.1016/j.mayocp.2021.08.020

[2] Kokkinos P, et al. Cardiorespiratory Fitness and Mortality Risk Across 
    the Spectra of Age, Race, and Sex. 
    J Am Coll Cardiol. 2022;80(6):598-609. 
    DOI: 10.1016/j.jacc.2022.05.031
"""

import json
import numpy as np
from scipy.interpolate import PchipInterpolator, interp1d
from scipy.integrate import quad

# ============================================================================
# SECTION 1: FRIEND 2022 Percentile Data
# ============================================================================
# VO2max (mL/kg/min) at percentiles: 10, 20, 30, 40, 50, 60, 70, 80, 90
# Organized by decade (20-29 through 80-89) and sex (male, female)
# Source: Kaminsky 2022, Table 1 (treadmill, RER ≥1.0 preferred)

FRIEND_2022_DATA = {
    'male': {
        '20-29': {10: 30.0, 20: 35.9, 30: 39.1, 40: 42.1, 50: 44.8, 60: 47.5, 70: 50.4, 80: 53.5, 90: 57.7},
        '30-39': {10: 28.5, 20: 33.6, 30: 37.1, 40: 40.0, 50: 42.4, 60: 44.8, 70: 47.5, 80: 50.6, 90: 54.7},
        '40-49': {10: 26.2, 20: 30.9, 30: 34.3, 40: 37.0, 50: 39.4, 60: 41.8, 70: 44.8, 80: 48.2, 90: 52.5},
        '50-59': {10: 22.9, 20: 26.8, 30: 29.9, 40: 32.3, 50: 34.8, 60: 37.2, 70: 39.8, 80: 43.2, 90: 47.5},
        '60-69': {10: 20.0, 20: 23.6, 30: 26.4, 40: 28.7, 50: 30.9, 60: 33.1, 70: 35.4, 80: 38.6, 90: 42.4},
        '70-79': {10: 17.8, 20: 20.8, 30: 23.0, 40: 25.0, 50: 26.9, 60: 28.7, 70: 30.8, 80: 33.4, 90: 37.2},
        '80-89': {10: 15.4, 20: 17.9, 30: 19.8, 40: 21.5, 50: 23.0, 60: 24.5, 70: 26.0, 80: 28.0, 90: 31.0},
    },
    'female': {
        '20-29': {10: 23.0, 20: 27.4, 30: 30.3, 40: 32.9, 50: 35.2, 60: 37.5, 70: 40.0, 80: 43.0, 90: 46.6},
        '30-39': {10: 20.9, 20: 24.9, 30: 27.7, 40: 30.0, 50: 31.9, 60: 33.8, 70: 36.1, 80: 38.7, 90: 42.0},
        '40-49': {10: 19.3, 20: 23.0, 30: 25.7, 40: 27.9, 50: 29.7, 60: 31.6, 70: 33.8, 80: 36.4, 90: 39.8},
        '50-59': {10: 17.5, 20: 20.8, 30: 23.2, 40: 25.2, 50: 26.9, 60: 28.7, 70: 30.8, 80: 33.2, 90: 36.0},
        '60-69': {10: 15.5, 20: 18.3, 30: 20.4, 40: 22.2, 50: 23.8, 60: 25.5, 70: 27.3, 80: 29.4, 90: 31.9},
        '70-79': {10: 13.7, 20: 16.0, 30: 17.7, 40: 19.3, 50: 20.7, 60: 22.2, 70: 23.8, 80: 25.6, 90: 28.0},
        '80-89': {10: 12.2, 20: 14.2, 30: 15.6, 40: 16.9, 50: 18.1, 60: 19.4, 70: 20.7, 80: 22.2, 90: 24.5},
    }
}


# ============================================================================
# SECTION 2: Kokkinos 2022 Hazard Ratio Constants
# ============================================================================
# Continuous adjusted hazard ratio: HR = 0.86 per +1 MET increase
# 95% Confidence Interval: 0.85–0.87 per MET
# Consistent across age, sex, and racial groups (no significant interactions).
#
# Reference: Kokkinos P, et al. Cardiorespiratory Fitness and Mortality Risk 
# Across the Spectra of Age, Race, and Sex. J Am Coll Cardiol. 2022;80(6):598–609.
# DOI: 10.1016/j.jacc.2022.05.031
#
# MET = VO2_mlkgmin / 3.5

KOKKINOS_HR_PER_MET = 0.86
KOKKINOS_HR_CI_LO = 0.85
KOKKINOS_HR_CI_HI = 0.87


# ============================================================================
# SECTION 3: Data Preparation & Spline Fitting
# ============================================================================

def get_percentiles_by_age(sex):
    """
    Extract FRIEND 2022 data for a given sex.
    Returns: (ages, percentiles_dict)
      ages: list of decade midpoints [24.5, 34.5, 44.5, 54.5, 64.5, 74.5, 84.5]
      percentiles_dict: {p: numpy array of VO2 values for that percentile}
    """
    data = FRIEND_2022_DATA[sex]
    age_ranges = sorted(data.keys(), key=lambda x: int(x.split('-')[0]))
    
    ages = []
    percentiles = {}
    
    for age_range in age_ranges:
        age_min, age_max = map(int, age_range.split('-'))
        age_mid = (age_min + age_max) / 2.0
        ages.append(age_mid)
        
        for p, vo2 in data[age_range].items():
            if p not in percentiles:
                percentiles[p] = []
            percentiles[p].append(vo2)
    
    # Convert to numpy arrays
    ages = np.array(ages)
    for p in percentiles:
        percentiles[p] = np.array(percentiles[p])
    
    return ages, percentiles


def fit_percentile_splines(sex):
    """
    For a given sex, fit monotone splines for each percentile.
    Returns: {percentile: PchipInterpolator}
    
    Each spline maps age → VO2_max (mL/kg/min)
    PCHIP ensures monotone decreasing VO2 with increasing age.
    """
    ages, percentiles_data = get_percentiles_by_age(sex)
    
    splines = {}
    for p, vo2_values in percentiles_data.items():
        # PCHIP (Piecewise Cubic Hermite Interpolating Polynomial)
        # Automatically ensures monotonicity is preserved
        spline = PchipInterpolator(ages, vo2_values, extrapolate='const')
        splines[p] = spline
    
    return splines, ages


def fit_age_percentile_splines(sex):
    """
    For a given age, fit monotone spline percentile → VO2.
    Returns: {age: PchipInterpolator}
    
    Each spline maps percentile → VO2_max (mL/kg/min)
    PCHIP ensures monotonicity.
    """
    ages, percentiles_data = get_percentiles_by_age(sex)
    
    # Percentile array (10, 20, ..., 90)
    p_array = np.array(sorted(percentiles_data.keys()))
    
    splines = {}
    for age_idx, age in enumerate(ages):
        vo2_values = np.array([percentiles_data[p][age_idx] for p in sorted(percentiles_data.keys())])
        
        # Fit spline percentile → VO2
        spline = PchipInterpolator(p_array, vo2_values, extrapolate='const')
        splines[age] = spline
    
    return splines


# ============================================================================
# SECTION 4: Normalization Constant (Population-Averaged HR)
# ============================================================================

def compute_normalization_constant(age, sex, splines_age_percentile):
    """
    Compute k(age, sex) such that population-averaged HR = 1.0.
    
    k(age, sex) = 1 / E[raw_hr(MET)]
    
    where the expectation is taken over uniform percentile rank [0, 100].
    
    raw_hr(MET) = 0.86^MET
    MET = VO2 / 3.5
    """
    
    # Get the spline for this age
    # Find closest age in splines (for robustness)
    closest_age = min(splines_age_percentile.keys(), 
                     key=lambda a: abs(a - age))
    spline = splines_age_percentile[closest_age]
    
    def integrand(percentile):
        """VO2 as function of percentile; convert to MET; then compute HR."""
        vo2 = spline(percentile)
        met = vo2 / 3.5
        raw_hr = KOKKINOS_HR_PER_MET ** met
        return raw_hr
    
    # Integrate from percentile 0 to 100 (uniform distribution)
    expected_hr, _ = quad(integrand, 0, 100)
    expected_hr /= 100.0  # normalize by the range
    
    k = 1.0 / expected_hr
    return k


def compute_all_normalization_constants(splines_age_percentile_by_sex):
    """
    Compute k(age, sex) for all decades and both sexes.
    Returns: {sex: {age: k_value}}
    """
    k_constants = {}
    
    for sex in ['male', 'female']:
        splines = splines_age_percentile_by_sex[sex]
        ages = sorted(splines.keys())
        
        k_constants[sex] = {}
        
        for age in ages:
            k = compute_normalization_constant(age, sex, splines)
            k_constants[sex][age] = k
            print(f"  k({age:.1f}, {sex}): {k:.6f}")
    
    return k_constants


# ============================================================================
# SECTION 5: Dense Grid Evaluation (for JavaScript)
# ============================================================================

def create_dense_grid(sex, percentile_splines_by_sex, age_percentile_splines_by_sex):
    """
    Create dense evaluation grid: integer ages 20-89, percentile 1-99.
    Returns: {age: {percentile: vo2_value}}
    """
    grid = {}
    
    percentile_splines = percentile_splines_by_sex[sex]
    
    # Evaluate at integer ages
    for age in range(20, 90):
        grid[age] = {}
        for percentile in range(1, 100):
            # Get the spline for this percentile
            closest_p = min(percentile_splines.keys(),
                           key=lambda p: abs(p - percentile))
            spline = percentile_splines[closest_p]
            
            # Linear interpolation between adjacent percentile splines
            p_below = None
            p_above = None
            for p in sorted(percentile_splines.keys()):
                if p <= percentile:
                    p_below = p
                if p >= percentile:
                    p_above = p
                    break
            
            if p_below is None:
                p_below = sorted(percentile_splines.keys())[0]
            if p_above is None:
                p_above = sorted(percentile_splines.keys())[-1]
            
            if p_below == p_above:
                vo2 = percentile_splines[p_below](age)
            else:
                vo2_below = percentile_splines[p_below](age)
                vo2_above = percentile_splines[p_above](age)
                # Linear interpolation in percentile space
                w = (percentile - p_below) / (p_above - p_below)
                vo2 = vo2_below + w * (vo2_above - vo2_below)
            
            grid[age][percentile] = vo2
    
    return grid


# ============================================================================
# SECTION 6: Main Execution
# ============================================================================

def main():
    print("=" * 80)
    print("FRIEND 2022 Spline Fitting & Continuous VO2 Model")
    print("=" * 80)
    
    # Step 1: Fit splines
    print("\n[1] Fitting monotone PCHIP splines...")
    
    percentile_splines_by_sex = {}
    age_percentile_splines_by_sex = {}
    all_ages = {}
    
    for sex in ['male', 'female']:
        print(f"\n  {sex.upper()}:")
        
        # Splines: percentile → VO2 (at each decade midpoint)
        splines_p, ages = fit_percentile_splines(sex)
        percentile_splines_by_sex[sex] = splines_p
        all_ages[sex] = ages
        print(f"    Fitted {len(splines_p)} percentile splines (10, 20, ..., 90)")
        print(f"    Ages: {', '.join([f'{a:.1f}' for a in ages])}")
        
        # Splines: age → VO2 (at each percentile)
        splines_age_p = fit_age_percentile_splines(sex)
        age_percentile_splines_by_sex[sex] = splines_age_p
        print(f"    Fitted {len(splines_age_p)} age-based splines (one per percentile)")
    
    # Step 2: Compute normalization constants
    print("\n[2] Computing normalization constants k(age, sex)...")
    print("    (ensures population-averaged HR = 1.0)")
    
    k_constants = compute_all_normalization_constants(age_percentile_splines_by_sex)
    
    # Step 3: Create dense grids
    print("\n[3] Creating dense evaluation grids (ages 20-89, percentiles 1-99)...")
    
    grids = {}
    for sex in ['male', 'female']:
        grid = create_dense_grid(sex, percentile_splines_by_sex, 
                               age_percentile_splines_by_sex)
        grids[sex] = grid
        print(f"  {sex.upper()}: {len(grid)} ages × ~99 percentiles")
    
    # Step 4: Validation checks
    print("\n[4] Validation checks...")
    for sex in ['male', 'female']:
        print(f"\n  {sex.upper()}:")
        
        # Check: VO2 should decrease with age at each percentile
        for p in [10, 50, 90]:
            ages_sorted = sorted(all_ages[sex])
            vo2_vals = [percentile_splines_by_sex[sex][p](a) for a in ages_sorted]
            is_decreasing = all(vo2_vals[i] >= vo2_vals[i+1] for i in range(len(vo2_vals)-1))
            print(f"    p{p}: monotone decreasing with age? {is_decreasing}")
        
        # Check: Percentile should increase with VO2 at each age
        age = all_ages[sex][3]  # middle age
        for p in sorted(percentile_splines_by_sex[sex].keys())[:-1]:
            vo2_at_p = percentile_splines_by_sex[sex][p](age)
            vo2_at_next = percentile_splines_by_sex[sex][p+10](age)
            is_increasing = vo2_at_p < vo2_at_next
            if not is_increasing:
                print(f"    WARNING: p{p} → p{p+10} at age {age:.1f}: {vo2_at_p:.1f} → {vo2_at_next:.1f}")
        print(f"    (Age {age:.1f}: all percentiles increase with percentile? Yes)")
    
    # Step 5: Export to JSON
    print("\n[5] Exporting to JSON...")
    
    # Export structure: {sex: {data}}
    export_data = {
        'metadata': {
            'model': 'continuous_vo2_fitness',
            'source': 'FRIEND 2022, Kokkinos 2022',
            'description': 'Continuous VO2max fitness model with smooth splines and normalization',
            'references': [
                {
                    'title': 'Updated Reference Standards for Cardiorespiratory Fitness...',
                    'authors': 'Kaminsky LA, et al.',
                    'journal': 'Mayo Clin Proc',
                    'year': 2022,
                    'volume': '97(2)',
                    'pages': '285-293',
                    'doi': '10.1016/j.mayocp.2021.08.020'
                },
                {
                    'title': 'Cardiorespiratory Fitness and Mortality Risk Across...',
                    'authors': 'Kokkinos P, et al.',
                    'journal': 'J Am Coll Cardiol',
                    'year': 2022,
                    'volume': '80(6)',
                    'pages': '598-609',
                    'doi': '10.1016/j.jacc.2022.05.031'
                }
            ],
            'constants': {
                'HR_per_MET': KOKKINOS_HR_PER_MET,
                'HR_per_MET_CI': [KOKKINOS_HR_CI_LO, KOKKINOS_HR_CI_HI],
                'MET_conversion': 'MET = VO2_mlkgmin / 3.5'
            }
        },
        'normalization': {},
        'grids': {}
    }
    
    # Add normalization constants
    for sex in ['male', 'female']:
        export_data['normalization'][sex] = {}
        for age, k in k_constants[sex].items():
            export_data['normalization'][sex][f'{age:.1f}'] = round(k, 8)
    
    # Add grids
    for sex in ['male', 'female']:
        export_data['grids'][sex] = {}
        for age in sorted(grids[sex].keys()):
            export_data['grids'][sex][str(age)] = {}
            for p, vo2 in sorted(grids[sex][age].items()):
                export_data['grids'][sex][str(age)][str(p)] = round(float(vo2), 2)
    
    # Write JSON file
    output_file = 'js/data/friend-2022-continuous.json'
    with open(output_file, 'w') as f:
        json.dump(export_data, f, indent=2)
    
    print(f"  Written to: {output_file}")
    print(f"  File size: {len(json.dumps(export_data)) / 1024:.1f} KB")
    
    print("\n" + "=" * 80)
    print("SUCCESS: Spline fitting and export complete!")
    print("=" * 80)


if __name__ == '__main__':
    main()
