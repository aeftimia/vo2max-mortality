#!/usr/bin/env python3
"""
Unit tests for FRIEND 2022 spline fitting and normalization.

Tests cover:
1. Monotonicity: VO2 decreases with age, increases with percentile
2. Boundary conditions: Interpolation at known percentiles matches table values
3. Integrator validation: scipy.quad integration vs Monte Carlo integration
4. Normalization: Population-averaged HR equals 1.0 (within tolerance)
5. Extrapolation safety: Out-of-bounds queries handled gracefully
"""

import numpy as np
import sys
from pathlib import Path

# Add scripts dir to path
sys.path.insert(0, str(Path(__file__).parent))

from fit_friend_splines import (
    fit_percentile_splines,
    fit_age_percentile_splines,
    compute_normalization_constant,
    get_percentiles_by_age,
    KOKKINOS_HR_PER_MET,
    FRIEND_2022_DATA,
)


class TestSplineMonotonicity:
    """Test that splines preserve monotonicity constraints."""
    
    def test_vo2_decreases_with_age(self):
        """VO2 must decrease as age increases (for fixed percentile)."""
        splines, ages = fit_percentile_splines('male')
        
        # Test each percentile
        for p, spline in splines.items():
            vo2_values = [spline(a) for a in ages]
            
            # Check monotone decreasing
            for i in range(len(vo2_values) - 1):
                assert vo2_values[i] >= vo2_values[i+1], \
                    f"Male p={p}: VO2 increased from age {ages[i]} to {ages[i+1]}"
            print(f"✓ Male {p}th percentile: monotone decreasing with age")
    
    def test_vo2_increases_with_percentile(self):
        """VO2 must increase as percentile increases (for fixed age)."""
        splines = fit_age_percentile_splines('male')
        
        # Test each age
        for age, spline in splines.items():
            percentiles = np.array([10, 20, 30, 40, 50, 60, 70, 80, 90])
            vo2_values = [spline(p) for p in percentiles]
            
            # Check monotone increasing
            for i in range(len(vo2_values) - 1):
                assert vo2_values[i] <= vo2_values[i+1], \
                    f"Age {age}: VO2 decreased from p={percentiles[i]} to p={percentiles[i+1]}"
            print(f"✓ Age {age}: monotone increasing with percentile")


class TestSplineInterpolation:
    """Test that splines match known data points."""
    
    def test_percentile_spline_at_table_values(self):
        """Spline should exactly match (or be very close to) published table values."""
        splines, ages = fit_percentile_splines('male')
        ages_dict = get_percentiles_by_age('male')[1]
        
        # Check each percentile at each age
        max_error = 0
        for p, spline in splines.items():
            table_values = ages_dict[p]
            for age_idx, age in enumerate(ages):
                spline_val = spline(age)
                table_val = table_values[age_idx]
                error = abs(spline_val - table_val)
                max_error = max(max_error, error)
                
                # PCHIP should be exact at control points
                assert error < 0.01, \
                    f"Spline at p={p}, age={age}: expected {table_val}, got {spline_val} (error={error})"
        
        print(f"✓ Percentile splines match table values (max error: {max_error:.6f} mL/kg/min)")
    
    def test_age_percentile_spline_at_table_values(self):
        """Age-percentile splines should match table values at known percentiles."""
        splines = fit_age_percentile_splines('female')
        ages_dict = get_percentiles_by_age('female')[1]
        
        max_error = 0
        for age, spline in splines.items():
            for p in [10, 20, 30, 40, 50, 60, 70, 80, 90]:
                # Get index of this age in the ages list
                ages_list = get_percentiles_by_age('female')[0]
                age_idx = list(ages_list).index(age)
                
                table_val = ages_dict[p][age_idx]
                spline_val = spline(p)
                error = abs(spline_val - table_val)
                max_error = max(max_error, error)
                
                assert error < 0.01, \
                    f"Age-percentile spline at age={age}, p={p}: error={error}"
        
        print(f"✓ Age-percentile splines match table values (max error: {max_error:.6f} mL/kg/min)")


class TestNormalizationIntegration:
    """Test normalization constant computation."""
    
    def test_normalization_via_scipy_quad(self):
        """Normalization constant should be computed accurately via scipy.quad."""
        splines = fit_age_percentile_splines('male')
        
        # Test a few ages
        test_ages = [20, 35, 50, 65, 80]
        k_values = {}
        
        for age in test_ages:
            closest_age = min(splines.keys(), key=lambda a: abs(a - age))
            k = compute_normalization_constant(age, 'male', splines)
            k_values[age] = k
            
            # k should be positive and reasonably close to 1
            assert k > 0, f"k must be positive at age {age}, got {k}"
            # For a population where VO2 is roughly normally distributed around
            # some median, we'd expect k close to 1 (within 1-10% of 1)
            assert 0.8 < k < 1.2, f"k={k} at age {age} seems unreasonable"
            print(f"✓ Age {age}: k = {k:.6f}")
        
        return k_values
    
    def test_monte_carlo_vs_scipy_quad(self):
        """Compare scipy.quad integration with Monte Carlo integration."""
        splines = fit_age_percentile_splines('male')
        age = 50
        closest_age = min(splines.keys(), key=lambda a: abs(a - age))
        spline = splines[closest_age]
        
        def integrand(percentile):
            vo2 = spline(percentile)
            met = vo2 / 3.5
            return KOKKINOS_HR_PER_MET ** met
        
        # Scipy quad integration
        quad_result, quad_err = __import__('scipy.integrate', fromlist=['quad']).quad(integrand, 0, 100)
        quad_result /= 100.0
        k_quad = 1.0 / quad_result
        
        # Monte Carlo integration
        n_samples = 100000
        percentiles_mc = np.random.uniform(0, 100, n_samples)
        integrand_vals = np.array([integrand(p) for p in percentiles_mc])
        mc_result = np.mean(integrand_vals)
        k_mc = 1.0 / mc_result
        
        # Compute relative error
        rel_error = abs(k_quad - k_mc) / k_quad
        
        print(f"✓ Normalization constant comparison at age {age}:")
        print(f"  scipy.quad: k = {k_quad:.8f}")
        print(f"  Monte Carlo (N={n_samples}): k = {k_mc:.8f}")
        print(f"  Relative error: {rel_error*100:.4f}%")
        
        # They should agree to within ~0.1% with 100k MC samples
        assert rel_error < 0.002, \
            f"scipy.quad and Monte Carlo differ too much: {rel_error*100:.2f}%"
    
    def test_population_averaged_hr_equals_one(self):
        """The population-averaged fitness HR should equal 1.0 by construction."""
        splines = fit_age_percentile_splines('male')
        
        test_ages = [25, 45, 65]
        for age in test_ages:
            closest_age = min(splines.keys(), key=lambda a: abs(a - age))
            spline = splines[closest_age]
            k = compute_normalization_constant(age, 'male', splines)
            
            # Integrate k * 0.86^MET over percentiles [0, 100]
            def normalized_integrand(percentile):
                vo2 = spline(percentile)
                met = vo2 / 3.5
                return k * (KOKKINOS_HR_PER_MET ** met)
            
            from scipy.integrate import quad
            pop_avg_hr, _ = quad(normalized_integrand, 0, 100)
            pop_avg_hr /= 100.0
            
            # Should be essentially 1.0
            error = abs(pop_avg_hr - 1.0)
            print(f"✓ Age {age}: population-averaged HR = {pop_avg_hr:.10f} (error: {error:.2e})")
            
            assert error < 1e-6, \
                f"Population-averaged HR should be 1.0, got {pop_avg_hr} at age {age}"


class TestBoundaryAndExtrapolation:
    """Test edge cases and extrapolation behavior."""
    
    def test_percentile_bounds(self):
        """Test behavior at percentile boundaries (< 10, > 90)."""
        splines = fit_age_percentile_splines('male')
        age = 50
        closest_age = min(splines.keys(), key=lambda a: abs(a - age))
        spline = splines[closest_age]
        
        # At boundaries
        vo2_10 = spline(10)
        vo2_90 = spline(90)
        
        # Below 10 should extrapolate to constant (10th percentile value)
        vo2_5 = spline(5)
        assert vo2_5 == vo2_10, "PCHIP with extrapolate='const' should hold at 10th percentile"
        
        # Above 90 should extrapolate to constant (90th percentile value)
        vo2_95 = spline(95)
        assert vo2_95 == vo2_90, "PCHIP with extrapolate='const' should hold at 90th percentile"
        
        print(f"✓ Percentile extrapolation: < 10 → const({vo2_10:.1f}), > 90 → const({vo2_90:.1f})")
    
    def test_age_extrapolation(self):
        """Test behavior at age boundaries."""
        splines, ages = fit_percentile_splines('male')
        min_age = min(ages)
        max_age = max(ages)
        
        # At the boundary percentiles
        spline = splines[50]
        
        # Before min age should extrapolate to constant
        vo2_min = spline(min_age)
        vo2_before = spline(min_age - 5)
        assert vo2_before == vo2_min, "Should extrapolate to constant before min age"
        
        # After max age should extrapolate to constant
        vo2_max = spline(max_age)
        vo2_after = spline(max_age + 5)
        assert vo2_after == vo2_max, "Should extrapolate to constant after max age"
        
        print(f"✓ Age extrapolation safe: before {min_age} → {vo2_min:.1f}, after {max_age} → {vo2_max:.1f}")


class TestRegressionAndConsistency:
    """Test consistency across both sexes and with FRIEND tables."""
    
    def test_male_vs_female_difference(self):
        """Males should have higher VO2 max than females at same age/percentile."""
        splines_m = fit_age_percentile_splines('male')
        splines_f = fit_age_percentile_splines('female')
        
        age = 45
        closest_m = min(splines_m.keys(), key=lambda a: abs(a - age))
        closest_f = min(splines_f.keys(), key=lambda a: abs(a - age))
        
        for p in [10, 50, 90]:
            vo2_m = splines_m[closest_m](p)
            vo2_f = splines_f[closest_f](p)
            
            assert vo2_m > vo2_f, f"Male VO2 should exceed female at p={p}, age={age}"
            print(f"✓ Age {age}, p={p}: Male {vo2_m:.1f} > Female {vo2_f:.1f}")


def run_all_tests():
    """Run all test classes."""
    print("=" * 70)
    print("SPLINE FITTING UNIT TESTS")
    print("=" * 70)
    
    test_suites = [
        ("Monotonicity", TestSplineMonotonicity),
        ("Interpolation", TestSplineInterpolation),
        ("Integration & Normalization", TestNormalizationIntegration),
        ("Boundary & Extrapolation", TestBoundaryAndExtrapolation),
        ("Regression & Consistency", TestRegressionAndConsistency),
    ]
    
    for suite_name, suite_class in test_suites:
        print(f"\n{suite_name}:")
        print("-" * 70)
        
        suite = suite_class()
        for method_name in dir(suite):
            if method_name.startswith('test_'):
                try:
                    method = getattr(suite, method_name)
                    method()
                except AssertionError as e:
                    print(f"✗ {method_name} FAILED: {e}")
                    return False
                except Exception as e:
                    print(f"✗ {method_name} ERROR: {e}")
                    import traceback
                    traceback.print_exc()
                    return False
    
    print("\n" + "=" * 70)
    print("ALL TESTS PASSED ✓")
    print("=" * 70)
    return True


if __name__ == '__main__':
    success = run_all_tests()
    sys.exit(0 if success else 1)
