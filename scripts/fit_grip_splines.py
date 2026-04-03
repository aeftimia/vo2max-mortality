#!/usr/bin/env python3
"""
Grip Strength Fitness Model: Spline Fitting & Normalization
============================================================

Applies the same interpolation methodology as fit_friend_splines.py to
grip strength normative data from the Lookup 7+ project (PMC7749608)
and mortality hazard ratios from Celis-Morales 2018 (BMJ k1651).

Key differences from VO2 max model:
  - Mortality HR is sex-stratified: women 1.20, men 1.16 per 5 kg lower grip
  - Normative data has 5 percentiles (5, 25, 50, 75, 95) vs FRIEND's 9
  - Age bins are 5-year (mostly), plus 18-24 (7yr) and 80+ (open-ended)

References:
-----------
[1] Landi F, et al. Normative values of muscle strength across ages in a
    'real world' population: results from the Longevity check-up 7+ project.
    J Cachexia Sarcopenia Muscle. 2020;11(6):1562-1569.
    DOI: 10.1002/jcsm.12610

[2] Celis-Morales CA, et al. Associations of grip strength with
    cardiovascular, respiratory, and cancer outcomes and all cause mortality:
    prospective cohort study of half a million UK Biobank participants.
    BMJ. 2018;361:k1651.
    DOI: 10.1136/bmj.k1651
"""

import json
import sys
import os
import numpy as np
from scipy.interpolate import PchipInterpolator

# Import shared spline utilities from the VO2 script
sys.path.insert(0, os.path.dirname(__file__))
from fit_friend_splines import (
    fit_pchip, eval_spline, integrate_spline,
    fit_monotone_histospline, verify_histospline_integrals,
)


# ============================================================================
# SECTION 1: Lookup 7+ Grip Strength Normative Data
# ============================================================================
# Handgrip strength (kg) at percentiles: 5, 25, 50, 75, 95
# Source: Landi 2020, Tables 2 (men) and 3 (women)
# Population: Italian community-dwellers, n=11,331

GRIP_DATA = {
    'male': {
        '18-24': {5: 30.0, 25: 38.0, 50: 44.0, 75: 50.0, 95: 61.0},
        '25-29': {5: 30.0, 25: 40.0, 50: 44.0, 75: 50.0, 95: 59.0},
        '30-34': {5: 30.0, 25: 40.0, 50: 46.0, 75: 51.0, 95: 61.3},
        '35-39': {5: 32.0, 25: 40.0, 50: 46.0, 75: 52.0, 95: 62.0},
        '40-44': {5: 31.0, 25: 42.0, 50: 47.1, 75: 52.0, 95: 60.5},
        '45-49': {5: 31.0, 25: 40.0, 50: 46.0, 75: 52.0, 95: 60.0},
        '50-54': {5: 30.3, 25: 39.6, 50: 44.6, 75: 50.0, 95: 59.3},
        '55-59': {5: 30.0, 25: 38.0, 50: 42.0, 75: 48.0, 95: 56.0},
        '60-64': {5: 26.8, 25: 35.0, 50: 40.0, 75: 46.0, 95: 62.0},
        '65-69': {5: 27.0, 25: 34.0, 50: 38.0, 75: 42.0, 95: 51.0},
        '70-74': {5: 22.4, 25: 31.2, 50: 35.1, 75: 40.0, 95: 48.0},
        '75-79': {5: 20.5, 25: 29.0, 50: 32.7, 75: 38.0, 95: 44.5},
        '80+':   {5: 16.0, 25: 23.0, 50: 29.0, 75: 32.9, 95: 42.0},
    },
    'female': {
        '18-24': {5: 16.2, 25: 22.0, 50: 27.0, 75: 31.8, 95: 37.9},
        '25-29': {5: 19.0, 25: 24.0, 50: 28.0, 75: 31.0, 95: 38.0},
        '30-34': {5: 18.0, 25: 23.3, 50: 27.0, 75: 30.1, 95: 40.0},
        '35-39': {5: 20.0, 25: 24.0, 50: 28.0, 75: 32.0, 95: 38.0},
        '40-44': {5: 20.0, 25: 24.0, 50: 28.0, 75: 31.0, 95: 38.0},
        '45-49': {5: 18.0, 25: 23.0, 50: 26.0, 75: 30.0, 95: 38.0},
        '50-54': {5: 17.0, 25: 22.0, 50: 25.1, 75: 29.0, 95: 35.0},
        '55-59': {5: 16.0, 25: 20.0, 50: 24.0, 75: 28.0, 95: 34.0},
        '60-64': {5: 14.0, 25: 20.0, 50: 22.0, 75: 26.0, 95: 32.0},
        '65-69': {5: 14.0, 25: 18.0, 50: 22.0, 75: 24.0, 95: 30.0},
        '70-74': {5: 10.0, 25: 16.0, 50: 20.0, 75: 23.0, 95: 29.0},
        '75-79': {5: 10.0, 25: 14.0, 50: 18.0, 75: 22.0, 95: 27.0},
        '80+':   {5:  8.0, 25: 12.5, 50: 16.0, 75: 20.0, 95: 25.0},
    }
}

# Age bin edges: treat 80+ as 80-90 for spline purposes
AGE_BIN_SPECS = [
    ('18-24', 18, 25),
    ('25-29', 25, 30),
    ('30-34', 30, 35),
    ('35-39', 35, 40),
    ('40-44', 40, 45),
    ('45-49', 45, 50),
    ('50-54', 50, 55),
    ('55-59', 55, 60),
    ('60-64', 60, 65),
    ('65-69', 65, 70),
    ('70-74', 70, 75),
    ('75-79', 75, 80),
    ('80+',   80, 90),
]

# Physiological grip strength floor (kg)
GRIP_FLOOR = 0.0

# ============================================================================
# SECTION 2: Celis-Morales 2018 Hazard Ratio Constants
# ============================================================================
# HR per 5 kg LOWER grip strength (i.e., HR > 1 means weaker = worse)
# We convert to HR per 1 kg HIGHER: hr = (1/HR_per_5kg)^(1/5) per kg
# Then raw_hr(grip) = hr_per_kg^grip = (1/HR_per_5kg)^(grip/5)

# All-cause mortality, sex-stratified
HR_PER_5KG_LOWER = {
    'male':   1.16,
    'female': 1.20,
}
HR_PER_5KG_LOWER_CI = {
    'male':   (1.15, 1.17),
    'female': (1.17, 1.23),
}

# Convert to per-kg-higher (the protective direction, < 1)
def hr_per_kg_higher(hr_per_5kg_lower):
    """Convert HR per 5 kg lower to HR per 1 kg higher."""
    return (1.0 / hr_per_5kg_lower) ** (1.0 / 5.0)


# ============================================================================
# SECTION 3: Model Building
# ============================================================================

def get_age_bin_data(sex):
    """Extract grip data organized by percentile, with bin edges."""
    data = GRIP_DATA[sex]
    bin_edges = np.array([spec[1] for spec in AGE_BIN_SPECS] + [AGE_BIN_SPECS[-1][2]])

    percentiles_data = {}
    for spec in AGE_BIN_SPECS:
        label = spec[0]
        for p, grip in data[label].items():
            if p not in percentiles_data:
                percentiles_data[p] = []
            percentiles_data[p].append(grip)

    for p in percentiles_data:
        percentiles_data[p] = np.array(percentiles_data[p])

    return bin_edges, percentiles_data


def build_full_model(sex):
    """
    Build the full 2D interpolation model for one sex.

    Stage 1 (age direction): For each of the 5 percentile levels,
    fit a monotone histospline across the 13 age bins.

    Stage 2 (percentile direction): For each integer age 18-89, evaluate the
    5 age histosplines to get grip at percentiles 5,25,50,75,95, then extend to
    0th and 100th percentile:
      - p=0:   GRIP_FLOOR (0 kg)
      - p=100: grip(95) + (grip(95) - grip(75))  (mirror the 75->95 gap)
    Then fit a monotone cubic Hermite (PCHIP) through all 7 knots [0,5,25,50,75,95,100].
    """
    bin_edges, percentiles_data = get_age_bin_data(sex)

    # Stage 1: age histosplines for each percentile level
    age_splines = {}
    for p in sorted(percentiles_data.keys()):
        spline = fit_monotone_histospline(bin_edges, percentiles_data[p])
        age_splines[p] = spline

    # Stage 2: for each integer age, build percentile spline
    percentile_splines = {}
    p_knots_data = np.array(sorted(percentiles_data.keys()))  # [5, 25, 50, 75, 95]

    for age in range(18, 90):
        # Evaluate each age histospline at midpoint of the year
        grip_at_data = np.array([
            eval_spline(age_splines[p], float(age) + 0.5)
            for p in p_knots_data
        ])

        # Extend to 0th and 100th percentile
        grip_p0 = GRIP_FLOOR
        grip_p75 = grip_at_data[-2]  # 75th percentile
        grip_p95 = grip_at_data[-1]  # 95th percentile
        grip_p100 = grip_p95 + (grip_p95 - grip_p75)  # mirror the 75->95 gap

        # Ensure p0 < p5 (floor must be below the 5th percentile)
        grip_p0 = min(grip_p0, grip_at_data[0] - 0.1)

        # Build full knot vector [0, 5, 25, 50, 75, 95, 100]
        p_knots = np.concatenate([[0], p_knots_data, [100]])
        grip_values = np.concatenate([[grip_p0], grip_at_data, [grip_p100]])

        # Fit monotone cubic Hermite (PCHIP) through all 7 points
        pct_spline = fit_pchip(p_knots, grip_values)
        percentile_splines[age] = pct_spline

    return {
        'age_splines': age_splines,
        'percentile_splines': percentile_splines,
    }


# ============================================================================
# SECTION 4: Normalization (exact integration over HR)
# ============================================================================

def compute_grip_normalization(model, age, sex, hr_per_5kg_lower=None):
    """
    Compute k(age, sex) = 1 / E[HR_raw] using Gauss-Legendre quadrature.

    E[HR_raw] = (1/100) * integral_0^100 (1/hr_per_5kg)^(grip(p)/5) dp

    The grip(p) spline is piecewise cubic spanning [0, 100].
    """
    if hr_per_5kg_lower is None:
        hr_per_5kg_lower = HR_PER_5KG_LOWER[sex]

    # HR per 1 kg higher (protective direction)
    hr_per_kg = (1.0 / hr_per_5kg_lower) ** (1.0 / 5.0)

    pct_spline = model['percentile_splines'][age]
    knots = pct_spline['knots']
    coeffs = pct_spline['coeffs']

    gl_nodes, gl_weights = np.polynomial.legendre.leggauss(16)

    total = 0.0
    for i in range(len(coeffs)):
        co = coeffs[i]
        x_lo = knots[i]
        x_hi = knots[i + 1]
        mid = (x_lo + x_hi) / 2
        half = (x_hi - x_lo) / 2

        piece_sum = 0.0
        for node, weight in zip(gl_nodes, gl_weights):
            p = mid + half * node
            t = p - x_lo
            # Horner's method for grip(p)
            grip = co[0]
            for c in co[1:]:
                grip = grip * t + c
            # raw_hr = hr_per_kg^grip = (1/hr_per_5kg)^(grip/5)
            hr = hr_per_kg ** grip
            piece_sum += weight * hr

        total += piece_sum * half

    expected_hr = total / 100.0
    return 1.0 / expected_hr


# ============================================================================
# SECTION 5: Export to JSON
# ============================================================================

def export_model(models, output_file='js/data/grip-strength-data.js'):
    """
    Export spline coefficients as a JS file that sets window.GRIP_STRENGTH_DATA.
    """
    # Precompute hr_per_unit values for metadata
    hr_per_unit = {}
    hr_per_unit_ci = {}
    for sex in ['male', 'female']:
        hr_per_unit[sex] = (1.0 / HR_PER_5KG_LOWER[sex]) ** (1.0 / 5.0)
        lo_5kg, hi_5kg = HR_PER_5KG_LOWER_CI[sex]
        # Note: higher HR_per_5kg_lower means more harmful per kg lower
        # So the CI for hr_per_unit (protective direction) is inverted
        hr_per_unit_ci[sex] = [
            (1.0 / hi_5kg) ** (1.0 / 5.0),  # lo bound (less protective)
            (1.0 / lo_5kg) ** (1.0 / 5.0),   # hi bound (more protective)
        ]

    export_data = {
        'metadata': {
            'model': 'continuous_grip_strength_v1',
            'interpolation': {
                'age_direction': 'monotone quadratic histospline (bin-average preserving)',
                'percentile_direction': 'monotone cubic Hermite (PCHIP / Fritsch-Carlson)',
            },
            'source': 'Lookup 7+ (Landi 2020), Celis-Morales 2018',
            'description': 'Piecewise spline coefficients for grip_strength(age, percentile, sex).',
            'references': [
                {
                    'title': 'Normative values of muscle strength across ages...',
                    'authors': 'Landi F, et al.',
                    'journal': 'J Cachexia Sarcopenia Muscle',
                    'year': 2020,
                    'volume': '11(6)',
                    'pages': '1562-1569',
                    'doi': '10.1002/jcsm.12610'
                },
                {
                    'title': 'Associations of grip strength with cardiovascular, respiratory, and cancer outcomes...',
                    'authors': 'Celis-Morales CA, et al.',
                    'journal': 'BMJ',
                    'year': 2018,
                    'volume': '361',
                    'pages': 'k1651',
                    'doi': '10.1136/bmj.k1651'
                }
            ],
            'constants': {
                'HR_per_5kg_lower': {
                    'male': HR_PER_5KG_LOWER['male'],
                    'female': HR_PER_5KG_LOWER['female'],
                },
                'HR_per_5kg_lower_CI': {
                    'male': list(HR_PER_5KG_LOWER_CI['male']),
                    'female': list(HR_PER_5KG_LOWER_CI['female']),
                },
                'HR_per_unit': {
                    'male': round(hr_per_unit['male'], 10),
                    'female': round(hr_per_unit['female'], 10),
                },
                'HR_per_unit_CI': {
                    'male': [round(v, 10) for v in hr_per_unit_ci['male']],
                    'female': [round(v, 10) for v in hr_per_unit_ci['female']],
                },
                'unit_divisor': 5,
                'floor': GRIP_FLOOR,
            }
        },
        'normalization': {},
        'percentile_splines': {},
        'age_splines': {},
    }

    for sex in ['male', 'female']:
        model = models[sex]

        # Normalization constants: per HR variant (central + CI bounds)
        export_data['normalization'][sex] = {}
        for age in range(18, 90):
            k_central = compute_grip_normalization(model, age, sex, HR_PER_5KG_LOWER[sex])
            lo_5kg, hi_5kg = HR_PER_5KG_LOWER_CI[sex]
            k_lo = compute_grip_normalization(model, age, sex, lo_5kg)
            k_hi = compute_grip_normalization(model, age, sex, hi_5kg)
            export_data['normalization'][sex][str(age)] = {
                'k': round(k_central, 10),
                'k_lo': round(k_lo, 10),
                'k_hi': round(k_hi, 10),
            }

        # Percentile splines (one per integer age)
        export_data['percentile_splines'][sex] = {}
        for age in range(18, 90):
            sp = model['percentile_splines'][age]
            export_data['percentile_splines'][sex][str(age)] = {
                'knots': [round(k, 6) for k in sp['knots']],
                'coeffs': [[round(v, 10) for v in piece] for piece in sp['coeffs']],
                'values': [round(v, 6) for v in sp['values']],
            }

        # Age splines (one per percentile level)
        export_data['age_splines'][sex] = {}
        for p, sp in model['age_splines'].items():
            export_data['age_splines'][sex][str(p)] = {
                'knots': [round(k, 6) for k in sp['knots']],
                'coeffs': [[round(v, 10) for v in piece] for piece in sp['coeffs']],
                'values': [round(v, 6) for v in sp['values']],
            }

    minified = json.dumps(export_data, separators=(',', ':'))
    with open(output_file, 'w') as f:
        f.write('window.GRIP_STRENGTH_DATA = ' + minified + ';\n')

    print(f"  Written to: {output_file} ({len(minified) / 1024:.1f} KB)")

    return export_data


# ============================================================================
# SECTION 6: Main
# ============================================================================

def main():
    print("=" * 80)
    print("Grip Strength Spline Fitting (Histospline + PCHIP)")
    print("=" * 80)

    models = {}
    for sex in ['male', 'female']:
        print(f"\n[{sex.upper()}]")
        print("  Building full 2D model...")
        model = build_full_model(sex)
        models[sex] = model

        # Verify histospline integrals
        bin_edges, percentiles_data = get_age_bin_data(sex)
        print("  Verifying histospline bin integrals:")
        for p in sorted(percentiles_data.keys()):
            errors = verify_histospline_integrals(
                model['age_splines'][p], bin_edges, percentiles_data[p])
            max_err = max(errors)
            print(f"    p{p}: max error = {max_err:.6f} kg")

        # Sample normalization constants
        hr = HR_PER_5KG_LOWER[sex]
        print(f"  Normalization constants k(age) [HR per 5kg lower = {hr}]:")
        for age in [20, 30, 40, 50, 60, 70, 80]:
            k = compute_grip_normalization(model, age, sex)
            print(f"    k({age}) = {k:.8f}")

        # Sample grip values
        print("  Sample grip values:")
        for age in [25, 50, 75]:
            for pct in [5, 50, 95]:
                grip = eval_spline(model['percentile_splines'][age], pct)
                print(f"    age={age}, p={pct}: grip = {grip:.2f} kg")

    # Export
    print("\n[EXPORT]")
    export_model(models)

    print("\n" + "=" * 80)
    print("DONE")
    print("=" * 80)


if __name__ == '__main__':
    main()
