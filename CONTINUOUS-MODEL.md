# Continuous VO₂ Max Fitness Model

## Overview

The calculator uses a **continuous fitness model** combining:

- **FRIEND 2022** percentile norms (Kaminsky et al., *Mayo Clin Proc* 2022) — interpolated via monotone quadratic histosplines (age direction) and monotone quadratic splines (percentile direction)
- **Kokkinos 2022** per-MET hazard ratio (HR = 0.86, 95% CI: 0.85–0.87; *J Am Coll Cardiol* 2022) — applied as a continuous exponential model, normalized so population-average HR = 1.0
- **SSA 2022** Period Life Tables — baseline mortality

For full mathematical derivation, normalization details, and citations, see [methodology.html](methodology.html).

---

## File Structure

### Python (data generation)

| File | Purpose |
|------|---------|
| `scripts/fit_friend_splines.py` | Fits histosplines (age) + quadratic splines (percentile), computes normalization constants via Gauss-Legendre quadrature, exports JSON |
| `scripts/test_splines.py` | 23 unit tests: spline interpolation, integration, histospline bin-average preservation, normalization, full model sanity |

### JavaScript (runtime)

| File | Purpose |
|------|---------|
| `js/data/friend-2022-continuous.json` | Spline coefficients, normalization constants (k, k_lo, k_hi), metadata |
| `js/data/friend-2022-loader.js` | Fetches JSON (or builds synthetic fallback for file:// protocol) |
| `js/data/friend-2022-continuous-model.js` | `getVo2FromPercentile()`, `getPercentileFromVo2()`, `getNormalizedFitnessHR()` |
| `js/core/engine.js` | `computeMortality()` — main calculation entry point |
| `js/tests/test-continuous-model.js` | Browser-side model tests |

### JSON structure

```
{
  metadata: { constants: { HR_per_MET, HR_per_MET_CI, MET_divisor, VO2_floor } },
  normalization: { male: { "20": {k, k_lo, k_hi}, ... }, female: { ... } },
  percentile_splines: { male: { "20": {knots, coeffs, values}, ... }, female: { ... } },
  age_splines: { male: { "10": {knots, coeffs, values}, ... }, female: { ... } }
}
```

---

## Key Design Decisions

1. **Histospline (age direction):** FRIEND reports decade-bin averages, not point values. A monotone quadratic histospline preserves bin integrals exactly while providing smooth interpolation between decades.

2. **Quadratic spline (percentile direction):** C1-continuous monotone piecewise quadratic through 11 knots (p0, p10, ..., p90, p100). Slopes propagated left-to-right for guaranteed continuity.

3. **Physiological bounds:** VO₂ floor at 10 mL/kg/min (Shephard 2009) for p0; mirrored upper bound p100 = p90 + (p90 − p80). Replaces flat extrapolation.

4. **Triple normalization:** Three constants k, k_lo, k_hi per (age, sex) — one per HR-per-MET value (0.86, 0.85, 0.87). Each ensures E[HR] = 1.0 under its own exponential. CI propagation uses matched pairs (HR_lo with k_lo, HR_hi with k_hi).

5. **DRY constants:** HR_per_MET, CI bounds, MET_divisor, and VO2_floor are stored in JSON metadata and read at runtime. No hardcoded values in JS.

---

## Running

```bash
# Regenerate JSON from FRIEND data
python scripts/fit_friend_splines.py

# Run Python tests
python scripts/test_splines.py

# Run browser tests
# Open index.html, check console for test output
```
