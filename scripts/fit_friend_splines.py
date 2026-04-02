#!/usr/bin/env python3
"""
Continuous VO2 Max Fitness Model: Custom Spline Fitting & Normalization
========================================================================

Implements two interpolation methods for FRIEND 2022 percentile data:

1. **Age direction -- Monotone quadratic histospline:**
   FRIEND 2022 reports percentile values by age *bins* (20-29, 30-39, etc.).
   A histospline treats these as bin averages: the integral of the spline over
   each bin equals the published value x bin width.  This is more faithful to
   the source data than treating values as point estimates at midpoints.

2. **Percentile direction -- Monotone cubic Hermite (PCHIP):**
   The 9 published percentile ranks (10, 20, ..., 90) are treated as point
   values, extended to 0th and 100th with physiological bounds.  Scipy's
   PchipInterpolator (Fritsch-Carlson) fits a C1 monotone piecewise-cubic
   through all 11 knots.  Flat extrapolation outside [0, 100].

The age direction uses piecewise-quadratic polynomials; the percentile
direction uses piecewise-cubic.  Gauss-Legendre quadrature integrates
the exponential HR function over each piece for normalization.

References:
-----------
[1] Kaminsky LA, et al. Updated Reference Standards for Cardiorespiratory
    Fitness ... (FRIEND). Mayo Clin Proc. 2022;97(2):285-293.
    DOI: 10.1016/j.mayocp.2021.08.020

[2] Kokkinos P, et al. Cardiorespiratory Fitness and Mortality Risk Across
    the Spectra of Age, Race, and Sex.
    J Am Coll Cardiol. 2022;80(6):598-609.
    DOI: 10.1016/j.jacc.2022.05.031
"""

import json
import numpy as np
from scipy.interpolate import PchipInterpolator

# ============================================================================
# SECTION 1: FRIEND 2022 Percentile Data
# ============================================================================
# VO2max (mL/kg/min) at percentiles: 10, 20, 30, 40, 50, 60, 70, 80, 90
# Organized by decade (20-29 through 80-89) and sex (male, female)
# Source: Kaminsky 2022, Table 1 (treadmill, RER >= 1.0 preferred)

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

# Age bin edges
AGE_BINS = [(20, 30), (30, 40), (40, 50), (50, 60), (60, 70), (70, 80), (80, 90)]

# Physiological VO2 max floor (mL/kg/min) — the lowest ambulatory/survivable
# level, used as the 0th-percentile value at all ages.
# Source: Shephard RJ. Br J Sports Med. 2009;43(5):342-346.
#   Independence threshold ~15-18 ml/kg/min; clinical floor ~10-12 ml/kg/min.
# See also: Mancini DM et al. Circulation. 1991. (peak VO2 <=14 as high-risk
#   cutoff in heart failure).
# We use 10 ml/kg/min as the hard floor (roughly normal walking pace).
VO2_FLOOR = 10.0

# ============================================================================
# SECTION 2: Kokkinos 2022 Hazard Ratio Constants
# ============================================================================
KOKKINOS_HR_PER_MET = 0.86
KOKKINOS_HR_CI_LO = 0.85
KOKKINOS_HR_CI_HI = 0.87


# ============================================================================
# SECTION 3: Monotone Cubic Hermite Spline (for percentile direction)
# ============================================================================

def fit_pchip(x, y):
    """
    Fit a C1 monotone cubic Hermite interpolant via scipy PchipInterpolator.

    Each piece is q_i(t) = a_i*t^3 + b_i*t^2 + c_i*t + d_i  for t in [0, h_i]
    where t = x - x_i.

    Returns:
        dict with keys: knots, values, coeffs [(a,b,c,d)...], slopes
    """
    x = np.asarray(x, dtype=float)
    y = np.asarray(y, dtype=float)
    pchip = PchipInterpolator(x, y)

    # PPoly stores coefficients in descending power order: c[0]*t^3 + c[1]*t^2 + ...
    # with t = x - breakpoint[i]
    coeffs = []
    for i in range(len(pchip.x) - 1):
        coeffs.append(tuple(float(pchip.c[j, i]) for j in range(4)))

    return {
        'knots': x.tolist(),
        'values': y.tolist(),
        'coeffs': coeffs,
        'slopes': [float(pchip(xi, 1)) for xi in x],
    }


def eval_spline(spline, x_eval):
    """Evaluate a piecewise polynomial spline (any degree). Flat tails outside knot range.
    Coefficients in descending power order, evaluated via Horner's method."""
    knots = np.asarray(spline['knots'])
    coeffs = spline['coeffs']
    scalar = np.isscalar(x_eval)
    x_eval = np.atleast_1d(np.asarray(x_eval, dtype=float))

    result = np.empty_like(x_eval)
    for idx, xv in enumerate(x_eval):
        if xv <= knots[0]:
            result[idx] = spline['values'][0]
        elif xv >= knots[-1]:
            result[idx] = spline['values'][-1]
        else:
            i = int(np.searchsorted(knots, xv, side='right')) - 1
            i = min(i, len(coeffs) - 1)
            t = xv - knots[i]
            # Horner's method
            val = coeffs[i][0]
            for c in coeffs[i][1:]:
                val = val * t + c
            result[idx] = val

    return float(result[0]) if scalar else result


def integrate_spline(spline, x_lo, x_hi):
    """
    Exact closed-form integral of a piecewise polynomial spline over [x_lo, x_hi].
    Coefficients in descending power order; works for any polynomial degree.
    Handles flat tails outside knot range.
    """
    knots = np.asarray(spline['knots'])
    coeffs = spline['coeffs']
    values = spline['values']

    total = 0.0

    # Left constant tail
    if x_lo < knots[0]:
        tail_hi = min(x_hi, knots[0])
        total += values[0] * (tail_hi - x_lo)
        x_lo = knots[0]

    # Right constant tail
    if x_hi > knots[-1]:
        tail_lo = max(x_lo, knots[-1])
        total += values[-1] * (x_hi - tail_lo)
        x_hi = knots[-1]

    if x_lo >= x_hi:
        return total

    # Interior pieces
    for i in range(len(coeffs)):
        seg_lo = knots[i]
        seg_hi = knots[i + 1]
        lo = max(seg_lo, x_lo)
        hi = min(seg_hi, x_hi)
        if lo >= hi:
            continue

        c = coeffs[i]
        t_lo = lo - seg_lo
        t_hi = hi - seg_lo
        n = len(c)

        # Antiderivative: c[k]*t^(n-1-k) integrates to c[k]/(n-k) * t^(n-k)
        def antideriv(t):
            return sum(c[k] / (n - k) * t ** (n - k) for k in range(n))

        total += antideriv(t_hi) - antideriv(t_lo)

    return total


# ============================================================================
# SECTION 4: Monotone Quadratic Histospline (for age direction)
# ============================================================================

def fit_monotone_histospline(bin_edges, bin_values):
    """
    Fit a C1 monotone quadratic histospline.

    The data represents bin averages: for each bin [a_i, a_{i+1}], the integral
    of the spline over the bin divided by the bin width equals bin_values[i].

    For a quadratic piece on interval [0, h_i] with left value y_i and left
    slope b_i:
      q(t) = a_i*t^2 + b_i*t + y_i
      a_i  = (y_{i+1} - y_i - b_i*h_i) / h_i^2
      avg  = y_{i+1}/3 + 2*y_i/3 + b_i*h_i/6

    Propagation from (y_0, b_0):
      y_{i+1} = 3*avg_i - 2*y_i - b_i*h_i/2
      b_{i+1} = 2*(y_{i+1} - y_i)/h_i - b_i    (C1 continuity)

    The two free parameters (y_0, b_0) are chosen to minimize total squared
    curvature (integral of (2*a_i)^2 over each piece).

    Returns:
        dict with keys: knots, values, coeffs, slopes, bin_values
    """
    bin_edges = np.asarray(bin_edges, dtype=float)
    bin_values = np.asarray(bin_values, dtype=float)
    n_bins = len(bin_values)
    assert len(bin_edges) == n_bins + 1

    h = np.diff(bin_edges)

    def propagate_from(y0, b0):
        """Given initial slope b0 and value y0, propagate forward."""
        y = np.zeros(n_bins + 1)
        b = np.zeros(n_bins + 1)
        y[0] = y0
        b[0] = b0
        for i in range(n_bins):
            y[i + 1] = 3 * bin_values[i] - 2 * y[i] - b[i] * h[i] / 2
            b[i + 1] = 2 * (y[i + 1] - y[i]) / h[i] - b[i]
        return y, b

    # Optimize y0 and b0 to minimize total squared curvature
    from scipy.optimize import minimize

    def objective(params):
        y0, b0 = params
        y, b = propagate_from(y0, b0)
        total = 0.0
        for i in range(n_bins):
            a_i = (y[i + 1] - y[i] - b[i] * h[i]) / (h[i] ** 2)
            total += (2 * a_i) ** 2 * h[i]
        return total

    # Initial guess
    y0_init = bin_values[0]
    mid_spacing = ((bin_edges[1] + bin_edges[2]) / 2 - (bin_edges[0] + bin_edges[1]) / 2)
    b0_init = (bin_values[1] - bin_values[0]) / mid_spacing

    result = minimize(objective, [y0_init, b0_init], method='Nelder-Mead',
                      options={'xatol': 1e-12, 'fatol': 1e-14, 'maxiter': 10000})
    y0_opt, b0_opt = result.x
    y, b = propagate_from(y0_opt, b0_opt)

    # Build coefficients
    coeffs = []
    for i in range(n_bins):
        ci = y[i]
        bi = b[i]
        ai = (y[i + 1] - y[i] - bi * h[i]) / (h[i] ** 2)
        coeffs.append((float(ai), float(bi), float(ci)))

    # Enforce monotonicity: if vertex inside interval, linearize that piece
    for i in range(n_bins):
        a, bcoeff, c = coeffs[i]
        if a != 0:
            t_vertex = -bcoeff / (2 * a)
            if 0 < t_vertex < h[i]:
                slope = (y[i + 1] - y[i]) / h[i]
                coeffs[i] = (0.0, float(slope), float(y[i]))
                b[i] = slope
                b[i + 1] = slope

    return {
        'knots': bin_edges.tolist(),
        'values': y.tolist(),
        'coeffs': coeffs,
        'slopes': b.tolist(),
        'bin_values': bin_values.tolist(),
    }


def verify_histospline_integrals(spline, bin_edges, bin_values, tol=0.05):
    """Verify that the histospline reproduces bin averages."""
    bin_edges = np.asarray(bin_edges)
    errors = []
    for i in range(len(bin_values)):
        hi = bin_edges[i + 1] - bin_edges[i]
        integral = integrate_spline(spline, bin_edges[i], bin_edges[i + 1])
        avg = integral / hi
        error = abs(avg - bin_values[i])
        errors.append(error)
        if error > tol:
            print(f"  WARNING: bin {i} ({bin_edges[i]}-{bin_edges[i+1]}): "
                  f"avg={avg:.4f}, expected={bin_values[i]:.4f}, error={error:.4f}")
    return errors


# ============================================================================
# SECTION 5: Two-Stage Interpolation Pipeline
# ============================================================================

def get_age_bin_data(sex):
    """Extract FRIEND data organized by percentile, with bin edges."""
    data = FRIEND_2022_DATA[sex]
    age_ranges = sorted(data.keys(), key=lambda x: int(x.split('-')[0]))
    bin_edges = np.array([int(r.split('-')[0]) for r in age_ranges] +
                         [int(age_ranges[-1].split('-')[1]) + 1])

    percentiles_data = {}
    for age_range in age_ranges:
        for p, vo2 in data[age_range].items():
            if p not in percentiles_data:
                percentiles_data[p] = []
            percentiles_data[p].append(vo2)

    for p in percentiles_data:
        percentiles_data[p] = np.array(percentiles_data[p])

    return bin_edges, percentiles_data


def build_full_model(sex):
    """
    Build the full 2D interpolation model for one sex.

    Stage 1 (age direction): For each of the 9 FRIEND percentile levels,
    fit a monotone histospline across the 7 age bins.

    Stage 2 (percentile direction): For each integer age 20-89, evaluate the
    9 age histosplines to get VO2 at percentiles 10,20,...,90, then extend to
    0th and 100th percentile with physiological bounds:
      - p=0:   VO2_FLOOR (hard physiological minimum, ~10 mL/kg/min)
      - p=100: vo2(90) + (vo2(90) - vo2(80))  (mirror the 80->90 gap)
    Then fit a monotone cubic Hermite (PCHIP) through all 11 knots [0,10,...,90,100].

    Returns:
        dict with:
          'age_splines': {percentile: histospline}
          'percentile_splines': {age: cubic_hermite_spline}
    """
    bin_edges, percentiles_data = get_age_bin_data(sex)

    # Stage 1: age histosplines for each percentile level
    age_splines = {}
    for p in sorted(percentiles_data.keys()):
        spline = fit_monotone_histospline(bin_edges, percentiles_data[p])
        age_splines[p] = spline

    # Stage 2: for each integer age, build percentile spline
    percentile_splines = {}
    p_knots_friend = np.array(sorted(percentiles_data.keys()))  # [10, 20, ..., 90]

    for age in range(20, 90):
        # Evaluate each age histospline at midpoint of the year
        vo2_at_friend = np.array([
            eval_spline(age_splines[p], float(age) + 0.5)
            for p in p_knots_friend
        ])

        # Extend to 0th and 100th percentile
        vo2_p0 = VO2_FLOOR
        vo2_p80 = vo2_at_friend[-2]  # 80th percentile
        vo2_p90 = vo2_at_friend[-1]  # 90th percentile
        vo2_p100 = vo2_p90 + (vo2_p90 - vo2_p80)  # mirror the 80->90 gap

        # Ensure p0 < p10 (floor must be below the 10th percentile)
        vo2_p0 = min(vo2_p0, vo2_at_friend[0] - 0.1)

        # Build full knot vector [0, 10, 20, ..., 90, 100]
        p_knots = np.concatenate([[0], p_knots_friend, [100]])
        vo2_values = np.concatenate([[vo2_p0], vo2_at_friend, [vo2_p100]])

        # Fit monotone cubic Hermite (PCHIP) through all 11 points
        pct_spline = fit_pchip(p_knots, vo2_values)
        percentile_splines[age] = pct_spline

    return {
        'age_splines': age_splines,
        'percentile_splines': percentile_splines,
    }


def get_vo2(model, age, percentile):
    """
    Look up VO2 from the model at a given age and percentile.
    Percentile is clamped to [0, 100]. Outside the spline knot range,
    flat tails at the endpoint values are used (but knots now span 0-100).
    """
    age = max(20, min(89, age))
    return eval_spline(model['percentile_splines'][age], percentile)


# ============================================================================
# SECTION 6: Normalization (exact integration over HR)
# ============================================================================

def compute_normalization_constant(model, age, hr_per_met=KOKKINOS_HR_PER_MET):
    """
    Compute k(age, sex) = 1 / E[HR_raw] using Gauss-Legendre quadrature.

    E[HR_raw] = (1/100) * integral_0^100 hr_per_met^(VO2(p)/3.5) dp

    The VO2(p) spline is piecewise cubic spanning [0, 100], so we integrate
    each piece separately using 16-point GL (exact to ~15 digits for smooth
    integrands on each piece).
    """
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
            # Horner's method
            vo2 = co[0]
            for c in co[1:]:
                vo2 = vo2 * t + c
            hr = hr_per_met ** (vo2 / 3.5)
            piece_sum += weight * hr

        total += piece_sum * half

    expected_hr = total / 100.0
    return 1.0 / expected_hr


# ============================================================================
# SECTION 7: Export to JSON
# ============================================================================

def export_model(models, output_file='js/data/friend-2022-continuous.json'):
    """
    Export spline coefficients to JSON for JavaScript consumption.
    """
    export_data = {
        'metadata': {
            'model': 'continuous_vo2_fitness_v3',
            'interpolation': {
                'age_direction': 'monotone quadratic histospline (bin-average preserving)',
                'percentile_direction': 'monotone cubic Hermite (PCHIP / Fritsch-Carlson)',
            },
            'source': 'FRIEND 2022, Kokkinos 2022',
            'description': 'Piecewise spline coefficients for VO2max(age, percentile, sex). Age: quadratic. Percentile: cubic.',
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
                'MET_divisor': 3.5,
                'VO2_floor': VO2_FLOOR,
            }
        },
        'normalization': {},
        'percentile_splines': {},
        'age_splines': {},
    }

    for sex in ['male', 'female']:
        model = models[sex]

        # Normalization constants: one per HR-per-MET value (central + CI bounds)
        export_data['normalization'][sex] = {}
        for age in range(20, 90):
            k_central = compute_normalization_constant(model, age, KOKKINOS_HR_PER_MET)
            k_lo = compute_normalization_constant(model, age, KOKKINOS_HR_CI_LO)
            k_hi = compute_normalization_constant(model, age, KOKKINOS_HR_CI_HI)
            export_data['normalization'][sex][str(age)] = {
                'k': round(k_central, 10),
                'k_lo': round(k_lo, 10),
                'k_hi': round(k_hi, 10),
            }

        # Percentile splines (one per integer age)
        export_data['percentile_splines'][sex] = {}
        for age in range(20, 90):
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

    with open(output_file, 'w') as f:
        json.dump(export_data, f, indent=2)

    # Also write a JS file that embeds the data directly (no fetch needed)
    js_file = output_file.replace('.json', '-data.js')
    minified = json.dumps(export_data, separators=(',', ':'))
    with open(js_file, 'w') as f:
        f.write('window.FRIEND_2022_CONTINUOUS = ' + minified + ';\n')

    print(f"  Written to: {output_file}")
    print(f"  JSON size: {len(json.dumps(export_data)) / 1024:.1f} KB")
    print(f"  Written to: {js_file}")
    print(f"  JS size: {len(minified) / 1024 + 0.1:.1f} KB")

    return export_data


# ============================================================================
# SECTION 8: Main
# ============================================================================

def main():
    print("=" * 80)
    print("FRIEND 2022 Custom Spline Fitting (Histospline + PCHIP)")
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
            print(f"    p{p}: max error = {max_err:.6f} mL/kg/min")

        # Sample normalization constants
        print("  Normalization constants k(age):")
        for age in [25, 35, 45, 55, 65, 75, 85]:
            k = compute_normalization_constant(model, age)
            print(f"    k({age}) = {k:.8f}")

        # Sample VO2 values
        print("  Sample VO2 values:")
        for age in [30, 50, 70]:
            for pct in [10, 50, 90]:
                vo2 = get_vo2(model, age, pct)
                print(f"    age={age}, p={pct}: VO2 = {vo2:.2f}")

    # Export
    print("\n[EXPORT]")
    export_model(models)

    print("\n" + "=" * 80)
    print("DONE")
    print("=" * 80)


if __name__ == '__main__':
    main()
