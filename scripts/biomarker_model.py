#!/usr/bin/env python3
"""
Shared biomarker spline model pipeline.

Builds 2D (age x percentile) interpolation models for any biomarker with
published percentile values by age bins and sex. Used by both the VO2 max
and grip strength fitting scripts.

Pipeline:
  Stage 1 (age): monotone quadratic histospline per percentile level
  Stage 2 (percentile): monotone cubic Hermite (PCHIP) per integer age
  Normalization: E[HR_raw] via 16-point Gauss-Legendre quadrature
"""

import json
import numpy as np
from scipy.interpolate import PchipInterpolator
from scipy.optimize import minimize


# ============================================================================
# Spline primitives
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
            val = coeffs[i][0]
            for c in coeffs[i][1:]:
                val = val * t + c
            result[idx] = val

    return float(result[0]) if scalar else result


def integrate_spline(spline, x_lo, x_hi):
    """
    Exact closed-form integral of a piecewise polynomial spline over [x_lo, x_hi].
    Handles flat tails outside knot range.
    """
    knots = np.asarray(spline['knots'])
    coeffs = spline['coeffs']
    values = spline['values']

    total = 0.0

    if x_lo < knots[0]:
        tail_hi = min(x_hi, knots[0])
        total += values[0] * (tail_hi - x_lo)
        x_lo = knots[0]

    if x_hi > knots[-1]:
        tail_lo = max(x_lo, knots[-1])
        total += values[-1] * (x_hi - tail_lo)
        x_hi = knots[-1]

    if x_lo >= x_hi:
        return total

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

        def antideriv(t):
            return sum(c[k] / (n - k) * t ** (n - k) for k in range(n))

        total += antideriv(t_hi) - antideriv(t_lo)

    return total


def fit_histospline(bin_edges, bin_values):
    """
    Fit a C1 quadratic histospline.

    The data represents bin averages: for each bin [a_i, a_{i+1}], the integral
    of the spline over the bin divided by the bin width equals bin_values[i].

    The two free parameters (y_0, b_0) are chosen to minimize total squared
    curvature (integral of (2*a_i)^2 over each piece).
    """
    bin_edges = np.asarray(bin_edges, dtype=float)
    bin_values = np.asarray(bin_values, dtype=float)
    n_bins = len(bin_values)
    assert len(bin_edges) == n_bins + 1

    h = np.diff(bin_edges)

    def propagate_from(y0, b0):
        y = np.zeros(n_bins + 1)
        b = np.zeros(n_bins + 1)
        y[0] = y0
        b[0] = b0
        for i in range(n_bins):
            y[i + 1] = 3 * bin_values[i] - 2 * y[i] - b[i] * h[i] / 2
            b[i + 1] = 2 * (y[i + 1] - y[i]) / h[i] - b[i]
        return y, b

    def objective(params):
        y0, b0 = params
        y, b = propagate_from(y0, b0)
        total = 0.0
        for i in range(n_bins):
            a_i = (y[i + 1] - y[i] - b[i] * h[i]) / (h[i] ** 2)
            total += (2 * a_i) ** 2 * h[i]
        return total

    y0_init = bin_values[0]
    mid_spacing = ((bin_edges[1] + bin_edges[2]) / 2 - (bin_edges[0] + bin_edges[1]) / 2)
    b0_init = (bin_values[1] - bin_values[0]) / mid_spacing

    result = minimize(objective, [y0_init, b0_init], method='Nelder-Mead',
                      options={'xatol': 1e-12, 'fatol': 1e-14, 'maxiter': 10000})
    y0_opt, b0_opt = result.x
    y, b = propagate_from(y0_opt, b0_opt)

    coeffs = []
    for i in range(n_bins):
        ci = y[i]
        bi = b[i]
        ai = (y[i + 1] - y[i] - bi * h[i]) / (h[i] ** 2)
        coeffs.append((float(ai), float(bi), float(ci)))

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
# Generic model building
# ============================================================================

def parse_age_bins(raw_data, age_bin_specs):
    """Extract raw data organized by percentile, with bin edges."""
    bin_edges = np.array([s[1] for s in age_bin_specs] + [age_bin_specs[-1][2]])
    percentiles_data = {}
    for spec in age_bin_specs:
        label = spec[0]
        for p, val in raw_data[label].items():
            if p not in percentiles_data:
                percentiles_data[p] = []
            percentiles_data[p].append(val)
    for p in percentiles_data:
        percentiles_data[p] = np.array(percentiles_data[p])
    return bin_edges, percentiles_data


def build_model(raw_data, age_bin_specs, floor, age_range):
    """
    Build 2D interpolation model for one sex.

    Stage 1 (age): monotone quadratic histospline per published percentile level.
    Stage 2 (percentile): monotone PCHIP per integer age, extended to 0th/100th
        percentile with physiological floor and mirrored top gap.

    Args:
        raw_data: {age_label: {percentile: value}} for one sex
        age_bin_specs: [(label, start_age, end_age), ...]
        floor: physiological floor (0th percentile value)
        age_range: (start, end_exclusive) for integer ages
    """
    bin_edges, percentiles_data = parse_age_bins(raw_data, age_bin_specs)

    # Stage 1: age histosplines
    age_splines = {}
    for p in sorted(percentiles_data.keys()):
        age_splines[p] = fit_histospline(bin_edges, percentiles_data[p])

    # Stage 2: percentile splines
    percentile_splines = {}
    p_knots_data = np.array(sorted(percentiles_data.keys()))

    for age in range(*age_range):
        vals = np.array([
            eval_spline(age_splines[p], float(age) + 0.5)
            for p in p_knots_data
        ])

        # Extend to 0th and 100th percentile
        val_p0 = min(floor, vals[0] - 0.1)
        val_p100 = vals[-1] + (vals[-1] - vals[-2])  # mirror top gap

        p_knots = np.concatenate([[0], p_knots_data, [100]])
        all_vals = np.concatenate([[val_p0], vals, [val_p100]])

        percentile_splines[age] = fit_pchip(p_knots, all_vals)

    return {
        'age_splines': age_splines,
        'percentile_splines': percentile_splines,
        'bin_edges': bin_edges,
        'percentiles_data': percentiles_data,
    }


# ============================================================================
# Normalization
# ============================================================================

def compute_normalization(model, age, hr_base, unit_divisor):
    """
    k(age) = 1 / E[hr_base^(B(q) / unit_divisor)]

    Uses 16-point Gauss-Legendre quadrature per polynomial piece.
    hr_base is the per-unit HR (protective direction, < 1).
    """
    pct_spline = model['percentile_splines'][age]
    knots = pct_spline['knots']
    coeffs = pct_spline['coeffs']

    gl_nodes, gl_weights = np.polynomial.legendre.leggauss(16)

    total = 0.0
    for i in range(len(coeffs)):
        co = coeffs[i]
        x_lo, x_hi = knots[i], knots[i + 1]
        mid = (x_lo + x_hi) / 2
        half = (x_hi - x_lo) / 2

        piece_sum = 0.0
        for node, weight in zip(gl_nodes, gl_weights):
            p = mid + half * node
            t = p - x_lo
            val = co[0]
            for c in co[1:]:
                val = val * t + c
            piece_sum += weight * hr_base ** (val / unit_divisor)

        total += piece_sum * half

    return 1.0 / (total / 100.0)


# ============================================================================
# Export and pipeline
# ============================================================================

def export_js(export_data, js_var, output_file):
    """Write export_data as window.JS_VAR = {...};"""
    minified = json.dumps(export_data, separators=(',', ':'))
    with open(output_file, 'w') as f:
        f.write(f'window.{js_var} = {minified};\n')
    print(f"  Written to: {output_file} ({len(minified) / 1024:.1f} KB)")


def run_pipeline(config):
    """
    Full pipeline: build models, verify, normalize, export.

    config keys:
        name: str - display name
        raw_data: {sex: {age_label: {percentile: value}}}
        age_bin_specs: [(label, start, end), ...]
        floor: float - physiological floor
        age_range: (start, end_exclusive)
        unit: str - display unit (e.g. 'mL/kg/min', 'kg')
        unit_divisor: float - denominator in HR exponent
        hr: {
            'central': {sex: hr_base},
            'lo': {sex: hr_base},      (less protective CI bound)
            'hi': {sex: hr_base},      (more protective CI bound)
        }
        js_var: str - JS global variable name
        output_file: str - output path
        metadata: dict - included verbatim in export
    """
    print("=" * 80)
    print(f"{config['name']} Spline Fitting (Histospline + PCHIP)")
    print("=" * 80)

    models = {}
    for sex in ['male', 'female']:
        print(f"\n[{sex.upper()}]")
        model = build_model(
            config['raw_data'][sex],
            config['age_bin_specs'],
            config['floor'],
            config['age_range'],
        )
        models[sex] = model

        # Verify histospline bin integrals
        print("  Verifying histospline bin integrals:")
        for p in sorted(model['percentiles_data'].keys()):
            errors = verify_histospline_integrals(
                model['age_splines'][p], model['bin_edges'], model['percentiles_data'][p])
            print(f"    p{p}: max error = {max(errors):.6f} {config['unit']}")

        # Sample normalization constants
        hr_base = config['hr']['central'][sex]
        print(f"  Sample normalization constants k(age) [hr_base={hr_base:.6f}]:")
        start, end = config['age_range']
        for age in range(start + 5, end, 10):
            k = compute_normalization(model, age, hr_base, config['unit_divisor'])
            print(f"    k({age}) = {k:.8f}")

    # Build export data
    print("\n[EXPORT]")
    export_data = {
        'metadata': config['metadata'],
        'normalization': {},
        'percentile_splines': {},
        'age_splines': {},
    }

    for sex in ['male', 'female']:
        model = models[sex]

        # Normalization constants per CI variant
        export_data['normalization'][sex] = {}
        for age in range(*config['age_range']):
            k_c = compute_normalization(
                model, age, config['hr']['central'][sex], config['unit_divisor'])
            k_lo = compute_normalization(
                model, age, config['hr']['lo'][sex], config['unit_divisor'])
            k_hi = compute_normalization(
                model, age, config['hr']['hi'][sex], config['unit_divisor'])
            export_data['normalization'][sex][str(age)] = {
                'k': round(k_c, 10),
                'k_lo': round(k_lo, 10),
                'k_hi': round(k_hi, 10),
            }

        # Percentile splines (one per integer age)
        export_data['percentile_splines'][sex] = {}
        for age in range(*config['age_range']):
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

    export_js(export_data, config['js_var'], config['output_file'])

    print("\n" + "=" * 80)
    print("DONE")
    print("=" * 80)

    return export_data
