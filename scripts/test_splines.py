#!/usr/bin/env python3
"""
Unit tests for FRIEND 2022 spline fitting and normalization.

Tests cover:
1. Monotone quadratic spline: interpolation, monotonicity, C1 continuity, flat tails
2. Monotone histospline: bin-average preservation, monotonicity, C1 continuity
3. Exact integrator: closed-form vs scipy.quad comparison
4. Normalization: population-averaged HR equals 1.0
5. Full model: physiological plausibility, male > female, end-to-end consistency
"""

import numpy as np
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from fit_friend_splines import (
    fit_monotone_quadratic_spline,
    eval_quadratic_spline,
    integrate_quadratic_spline,
    fit_monotone_histospline,
    verify_histospline_integrals,
    build_full_model,
    get_vo2,
    compute_normalization_constant,
    get_age_bin_data,
    KOKKINOS_HR_PER_MET,
    FRIEND_2022_DATA,
)


# ============================================================================
# Test 1: Monotone Quadratic Spline
# ============================================================================

class TestMonotoneQuadraticSpline:

    def test_interpolation_at_knots(self):
        """Spline must pass exactly through data points."""
        x = np.array([10, 20, 30, 40, 50, 60, 70, 80, 90], dtype=float)
        y = np.array([20, 25, 29, 32, 35, 38, 41, 45, 50], dtype=float)
        spline = fit_monotone_quadratic_spline(x, y)

        max_err = 0
        for xi, yi in zip(x, y):
            val = eval_quadratic_spline(spline, xi)
            err = abs(val - yi)
            max_err = max(max_err, err)
            assert err < 1e-10, f"At x={xi}: expected {yi}, got {val}, err={err}"

        print(f"  PASS interpolation at knots (max error: {max_err:.2e})")

    def test_monotonicity_increasing(self):
        """Monotone increasing data must produce monotone increasing spline."""
        x = np.array([10, 20, 30, 40, 50, 60, 70, 80, 90], dtype=float)
        y = np.array([20, 25, 29, 32, 35, 38, 41, 45, 50], dtype=float)
        spline = fit_monotone_quadratic_spline(x, y)

        xs = np.linspace(10, 90, 1000)
        vals = eval_quadratic_spline(spline, xs)
        diffs = np.diff(vals)
        assert np.all(diffs >= -1e-10), \
            f"Monotonicity violated: min diff = {diffs.min()}"
        print("  PASS monotonicity (increasing)")

    def test_monotonicity_decreasing(self):
        """Monotone decreasing data must produce monotone decreasing spline."""
        x = np.array([20, 30, 40, 50, 60, 70, 80], dtype=float)
        y = np.array([50, 45, 40, 35, 30, 25, 20], dtype=float)
        spline = fit_monotone_quadratic_spline(x, y)

        xs = np.linspace(20, 80, 1000)
        vals = eval_quadratic_spline(spline, xs)
        diffs = np.diff(vals)
        assert np.all(diffs <= 1e-10), \
            f"Monotonicity violated: max diff = {diffs.max()}"
        print("  PASS monotonicity (decreasing)")

    def test_c1_continuity(self):
        """Derivative must be continuous at interior knots."""
        x = np.array([10, 20, 30, 40, 50, 60, 70, 80, 90], dtype=float)
        y = np.array([20, 25, 29, 32, 35, 38, 41, 45, 50], dtype=float)
        spline = fit_monotone_quadratic_spline(x, y)

        coeffs = spline['coeffs']
        knots = spline['knots']

        for i in range(len(coeffs) - 1):
            a1, b1, c1 = coeffs[i]
            a2, b2, c2 = coeffs[i + 1]
            h = knots[i + 1] - knots[i]
            # Right derivative of piece i
            deriv_right = 2 * a1 * h + b1
            # Left derivative of piece i+1
            deriv_left = b2
            err = abs(deriv_right - deriv_left)
            assert err < 1e-8, \
                f"C1 violation at knot {knots[i+1]}: left={deriv_left}, right={deriv_right}"

        print("  PASS C1 continuity at interior knots")

    def test_flat_tails(self):
        """Values outside knot range must equal endpoint values."""
        x = np.array([10, 20, 30, 40, 50], dtype=float)
        y = np.array([5, 10, 15, 20, 25], dtype=float)
        spline = fit_monotone_quadratic_spline(x, y)

        assert eval_quadratic_spline(spline, 0) == y[0], "Left tail not flat"
        assert eval_quadratic_spline(spline, 5) == y[0], "Left tail not flat"
        assert eval_quadratic_spline(spline, 60) == y[-1], "Right tail not flat"
        assert eval_quadratic_spline(spline, 100) == y[-1], "Right tail not flat"

        print("  PASS flat tails")


# ============================================================================
# Test 2: Exact Integrator
# ============================================================================

class TestIntegrator:

    def test_constant_function(self):
        """Integral of constant spline should be value * width."""
        spline = fit_monotone_quadratic_spline(
            np.array([0, 10], dtype=float),
            np.array([5, 5], dtype=float))
        integral = integrate_quadratic_spline(spline, 0, 10)
        assert abs(integral - 50.0) < 1e-10, f"Expected 50, got {integral}"
        print("  PASS constant function integral")

    def test_linear_function(self):
        """Integral of linear spline should match analytic result."""
        spline = fit_monotone_quadratic_spline(
            np.array([0, 10], dtype=float),
            np.array([0, 10], dtype=float))
        integral = integrate_quadratic_spline(spline, 0, 10)
        expected = 50.0  # integral of x from 0 to 10
        assert abs(integral - expected) < 1e-10, f"Expected {expected}, got {integral}"
        print("  PASS linear function integral")

    def test_vs_scipy_quad(self):
        """Exact integrator must match scipy.quad on a real percentile spline."""
        from scipy.integrate import quad as scipy_quad

        x = np.array([10, 20, 30, 40, 50, 60, 70, 80, 90], dtype=float)
        y = np.array([20, 25, 29, 32, 35, 38, 41, 45, 50], dtype=float)
        spline = fit_monotone_quadratic_spline(x, y)

        # Our exact integral
        our_integral = integrate_quadratic_spline(spline, 0, 100)

        # scipy quad
        scipy_integral, _ = scipy_quad(
            lambda xv: eval_quadratic_spline(spline, xv), 0, 100)

        rel_err = abs(our_integral - scipy_integral) / abs(scipy_integral)
        assert rel_err < 1e-10, \
            f"Integrator mismatch: ours={our_integral}, scipy={scipy_integral}, rel_err={rel_err}"

        print(f"  PASS vs scipy.quad (rel error: {rel_err:.2e})")

    def test_flat_tail_integration(self):
        """Integration over flat tails must work correctly."""
        x = np.array([10, 90], dtype=float)
        y = np.array([20, 50], dtype=float)
        spline = fit_monotone_quadratic_spline(x, y)

        # Left tail [0, 10]: constant 20
        left = integrate_quadratic_spline(spline, 0, 10)
        assert abs(left - 200.0) < 1e-10, f"Left tail: expected 200, got {left}"

        # Right tail [90, 100]: constant 50
        right = integrate_quadratic_spline(spline, 90, 100)
        assert abs(right - 500.0) < 1e-10, f"Right tail: expected 500, got {right}"

        print("  PASS flat tail integration")

    def test_partial_interval(self):
        """Integration over partial intervals must be correct."""
        x = np.array([0, 10], dtype=float)
        y = np.array([0, 10], dtype=float)
        spline = fit_monotone_quadratic_spline(x, y)

        # Integral of x from 3 to 7 = (49 - 9)/2 = 20
        integral = integrate_quadratic_spline(spline, 3, 7)
        expected = 20.0
        assert abs(integral - expected) < 1e-10, f"Expected {expected}, got {integral}"

        print("  PASS partial interval integration")


# ============================================================================
# Test 3: Monotone Histospline
# ============================================================================

class TestHistospline:

    def test_bin_averages_preserved(self):
        """Histospline integral over each bin must reproduce the bin average."""
        bin_edges = np.array([20, 30, 40, 50, 60, 70, 80, 90], dtype=float)
        bin_values = np.array([50, 45, 40, 35, 30, 25, 20], dtype=float)

        spline = fit_monotone_histospline(bin_edges, bin_values)
        errors = verify_histospline_integrals(spline, bin_edges, bin_values)
        max_err = max(errors)
        assert max_err < 1e-6, f"Bin average error too large: {max_err}"

        print(f"  PASS bin averages preserved (max error: {max_err:.2e})")

    def test_friend_data_bin_averages(self):
        """Histospline on actual FRIEND data must preserve bin averages."""
        for sex in ['male', 'female']:
            bin_edges, percentiles_data = get_age_bin_data(sex)
            for p in sorted(percentiles_data.keys()):
                spline = fit_monotone_histospline(bin_edges, percentiles_data[p])
                errors = verify_histospline_integrals(
                    spline, bin_edges, percentiles_data[p])
                max_err = max(errors)
                assert max_err < 1e-6, \
                    f"{sex} p{p}: bin average error {max_err}"

        print("  PASS FRIEND data bin averages preserved (all percentiles, both sexes)")

    def test_monotonicity(self):
        """FRIEND data is monotone decreasing with age; histospline must preserve this."""
        for sex in ['male', 'female']:
            bin_edges, percentiles_data = get_age_bin_data(sex)
            for p in sorted(percentiles_data.keys()):
                spline = fit_monotone_histospline(bin_edges, percentiles_data[p])
                xs = np.linspace(bin_edges[0], bin_edges[-1], 1000)
                vals = eval_quadratic_spline(spline, xs)
                diffs = np.diff(vals)
                assert np.all(diffs <= 1e-8), \
                    f"{sex} p{p}: monotonicity violated, max increase = {diffs.max()}"

        print("  PASS histospline monotonicity (all percentiles, both sexes)")

    def test_histospline_integrator_vs_scipy(self):
        """Exact integrator on histospline must match scipy.quad."""
        from scipy.integrate import quad as scipy_quad

        bin_edges = np.array([20, 30, 40, 50, 60, 70, 80, 90], dtype=float)
        bin_values = np.array([50, 45, 40, 35, 30, 25, 20], dtype=float)
        spline = fit_monotone_histospline(bin_edges, bin_values)

        our_integral = integrate_quadratic_spline(spline, 20, 90)
        scipy_integral, _ = scipy_quad(
            lambda x: eval_quadratic_spline(spline, x), 20, 90)

        rel_err = abs(our_integral - scipy_integral) / abs(scipy_integral)
        assert rel_err < 1e-10, \
            f"Integrator mismatch: ours={our_integral}, scipy={scipy_integral}"

        print(f"  PASS histospline integrator vs scipy (rel error: {rel_err:.2e})")


# ============================================================================
# Test 4: Normalization
# ============================================================================

class TestNormalization:

    def test_population_averaged_hr_equals_one(self):
        """Population-averaged fitness HR must equal 1.0 by construction."""
        from scipy.integrate import quad as scipy_quad

        for sex in ['male', 'female']:
            model = build_full_model(sex)

            for age in [25, 45, 65, 85]:
                k = compute_normalization_constant(model, age)

                # Verify: integral of k * 0.86^(VO2(p)/3.5) over [0,100] / 100 = 1.0
                def integrand(p):
                    vo2 = eval_quadratic_spline(
                        model['percentile_splines'][age], p)
                    return k * KOKKINOS_HR_PER_MET ** (vo2 / 3.5)

                avg_hr, _ = scipy_quad(integrand, 0, 100)
                avg_hr /= 100.0
                err = abs(avg_hr - 1.0)
                assert err < 1e-6, \
                    f"{sex} age {age}: pop-avg HR = {avg_hr}, error = {err}"

            print(f"  PASS {sex}: population-averaged HR = 1.0 at all tested ages")

    def test_normalization_k_reasonable(self):
        """Normalization constants should be in a physiologically reasonable range."""
        for sex in ['male', 'female']:
            model = build_full_model(sex)
            for age in range(20, 90):
                k = compute_normalization_constant(model, age)
                assert 1.0 < k < 10.0, \
                    f"{sex} age {age}: k = {k} out of range"

        print("  PASS normalization constants in reasonable range")

    def test_ci_normalization_pop_avg_hr_equals_one(self):
        """CI normalization constants must also produce pop-avg HR = 1.0."""
        from scipy.integrate import quad as scipy_quad
        from fit_friend_splines import KOKKINOS_HR_CI_LO, KOKKINOS_HR_CI_HI

        for sex in ['male', 'female']:
            model = build_full_model(sex)
            for age in [30, 50, 70]:
                for hr_val, label in [(KOKKINOS_HR_CI_LO, 'lo'), (KOKKINOS_HR_CI_HI, 'hi')]:
                    k = compute_normalization_constant(model, age, hr_per_met=hr_val)

                    def integrand(p, _k=k, _hr=hr_val):
                        vo2 = eval_quadratic_spline(
                            model['percentile_splines'][age], p)
                        return _k * _hr ** (vo2 / 3.5)

                    avg_hr, _ = scipy_quad(integrand, 0, 100)
                    avg_hr /= 100.0
                    err = abs(avg_hr - 1.0)
                    assert err < 1e-6, \
                        f"{sex} age {age} {label}: pop-avg HR = {avg_hr}, error = {err}"

        print("  PASS CI normalization constants produce pop-avg HR = 1.0")

    def test_ci_k_ordering(self):
        """k_lo (HR=0.85) > k (HR=0.86) > k_hi (HR=0.87) at all ages."""
        from fit_friend_splines import KOKKINOS_HR_CI_LO, KOKKINOS_HR_CI_HI

        for sex in ['male', 'female']:
            model = build_full_model(sex)
            for age in range(20, 90):
                k = compute_normalization_constant(model, age, KOKKINOS_HR_PER_MET)
                k_lo = compute_normalization_constant(model, age, KOKKINOS_HR_CI_LO)
                k_hi = compute_normalization_constant(model, age, KOKKINOS_HR_CI_HI)
                assert k_lo > k > k_hi, \
                    f"{sex} age {age}: k_lo={k_lo}, k={k}, k_hi={k_hi} ordering violated"

        print("  PASS k_lo > k > k_hi at all ages")


# ============================================================================
# Test 5: Full Model
# ============================================================================

class TestFullModel:

    def test_male_higher_than_female(self):
        """Males should have higher VO2 at same age and percentile."""
        model_m = build_full_model('male')
        model_f = build_full_model('female')

        for age in [25, 35, 45, 55, 65, 75, 85]:
            for pct in [10, 50, 90]:
                vo2_m = get_vo2(model_m, age, pct)
                vo2_f = get_vo2(model_f, age, pct)
                assert vo2_m > vo2_f, \
                    f"age={age} p={pct}: male {vo2_m} <= female {vo2_f}"

        print("  PASS male VO2 > female VO2 at all ages/percentiles")

    def test_vo2_decreases_with_age(self):
        """VO2 must decrease with age at fixed percentile."""
        for sex in ['male', 'female']:
            model = build_full_model(sex)
            for pct in [10, 50, 90]:
                prev = get_vo2(model, 20, pct)
                for age in range(21, 90):
                    curr = get_vo2(model, age, pct)
                    assert curr <= prev + 0.01, \
                        f"{sex} p={pct}: VO2 increased from age {age-1} to {age}"
                    prev = curr

        print("  PASS VO2 decreases with age (all percentiles, both sexes)")

    def test_vo2_increases_with_percentile(self):
        """VO2 must increase with percentile at fixed age (full 0-100 range)."""
        for sex in ['male', 'female']:
            model = build_full_model(sex)
            for age in range(20, 90):
                pcts = np.linspace(0, 100, 500)
                vals = [get_vo2(model, age, p) for p in pcts]
                diffs = np.diff(vals)
                assert np.all(diffs >= -1e-8), \
                    f"{sex} age {age}: VO2 decreased with percentile"

        print("  PASS VO2 increases with percentile (all ages, both sexes)")

    def test_tail_extrapolation(self):
        """p=0 should be at VO2 floor; p=100 should mirror 80->90 gap; tails interpolated."""
        from fit_friend_splines import VO2_FLOOR

        for sex in ['male', 'female']:
            model = build_full_model(sex)
            for age in [30, 50, 70]:
                v0 = get_vo2(model, age, 0)
                v5 = get_vo2(model, age, 5)
                v10 = get_vo2(model, age, 10)
                v80 = get_vo2(model, age, 80)
                v90 = get_vo2(model, age, 90)
                v95 = get_vo2(model, age, 95)
                v100 = get_vo2(model, age, 100)

                # p=0 should be at or near the VO2 floor
                assert v0 <= VO2_FLOOR + 0.1, \
                    f"{sex} age {age}: p0={v0} not at floor {VO2_FLOOR}"

                # Tails should NOT be flat — v5 should be between v0 and v10
                assert v0 < v5 < v10 + 0.01, \
                    f"{sex} age {age}: p5={v5} not between p0={v0} and p10={v10}"

                # p=100 should be approximately p90 + (p90 - p80)
                expected_p100 = v90 + (v90 - v80)
                assert abs(v100 - expected_p100) < 0.5, \
                    f"{sex} age {age}: p100={v100}, expected ~{expected_p100}"

                # v95 should be between v90 and v100
                assert v90 < v95 < v100 + 0.01, \
                    f"{sex} age {age}: p95={v95} not between p90={v90} and p100={v100}"

        print("  PASS physiological tail extrapolation")

    def test_plausible_values(self):
        """Spot-check that VO2 values are physiologically plausible."""
        model_m = build_full_model('male')

        # 30-year-old male, 50th percentile should be roughly 40-45
        v = get_vo2(model_m, 30, 50)
        assert 38 < v < 48, f"30M p50: {v} not in plausible range"

        # 70-year-old male, 50th percentile should be roughly 25-30
        v = get_vo2(model_m, 70, 50)
        assert 24 < v < 32, f"70M p50: {v} not in plausible range"

        # 30-year-old male, 90th percentile should be > 50
        v = get_vo2(model_m, 30, 90)
        assert v > 48, f"30M p90: {v} not > 48"

        print("  PASS plausible VO2 values")


# ============================================================================
# Runner
# ============================================================================

def run_all_tests():
    print("=" * 70)
    print("SPLINE FITTING UNIT TESTS (v2: histospline + quadratic)")
    print("=" * 70)

    test_suites = [
        ("Monotone Quadratic Spline", TestMonotoneQuadraticSpline),
        ("Exact Integrator", TestIntegrator),
        ("Monotone Histospline", TestHistospline),
        ("Normalization", TestNormalization),
        ("Full Model", TestFullModel),
    ]

    for suite_name, suite_class in test_suites:
        print(f"\n{suite_name}:")
        print("-" * 70)

        suite = suite_class()
        for method_name in sorted(dir(suite)):
            if method_name.startswith('test_'):
                try:
                    getattr(suite, method_name)()
                except AssertionError as e:
                    print(f"  FAIL {method_name}: {e}")
                    return False
                except Exception as e:
                    print(f"  ERROR {method_name}: {e}")
                    import traceback
                    traceback.print_exc()
                    return False

    print("\n" + "=" * 70)
    print("ALL TESTS PASSED")
    print("=" * 70)
    return True


if __name__ == '__main__':
    success = run_all_tests()
    sys.exit(0 if success else 1)
