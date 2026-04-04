/**
 * Generalized Fitness Model — Piecewise Spline Evaluator
 *
 * Evaluates precomputed piecewise spline coefficients for any fitness metric
 * (VO2 max, grip strength, etc.).  Two interpolation methods are used:
 *
 *   Age direction:        Monotone quadratic histospline (bin-average preserving)
 *   Percentile direction: Monotone cubic Hermite (PCHIP / Fritsch-Carlson)
 *
 * Each dataset contains:
 *   - percentile_splines[sex][age]: {knots, coeffs, values}
 *   - normalization[sex][age]: {k, k_lo, k_hi}
 *   - metadata.constants: HR parameters (may be scalar or sex-specific)
 *
 * Supported datasets:
 *   - FRIEND_2022_CONTINUOUS (VO2 max): HR = 0.86 per MET, sex-invariant
 *   - GRIP_STRENGTH_DATA (grip strength): HR sex-stratified (men 1.16, women 1.20 per 5kg lower)
 */

// ── Dataset references ──────────────────────────────────────────────────────
var FRIEND_2022_CONTINUOUS = (typeof window !== 'undefined')
  ? window.FRIEND_2022_CONTINUOUS || {}
  : global.FRIEND_2022_CONTINUOUS || {};

var GRIP_STRENGTH_DATA = (typeof window !== 'undefined')
  ? window.GRIP_STRENGTH_DATA || {}
  : global.GRIP_STRENGTH_DATA || {};

// ── Metric registry ─────────────────────────────────────────────────────────
// Maps metric ID to its dataset, display info, and HR extraction logic.
var METRIC_REGISTRY = {
  vo2max: {
    dataset: function() { return FRIEND_2022_CONTINUOUS; },
    label: 'VO\u2082 max',
    unit: 'mL/kg/min',
    inputLabel: 'VO\u2082 max (mL/kg/min)',
    minValue: 5,
    maxValue: 100,
    minAge: 20,
    maxAge: 89,
    placeholder: 'e.g. 35',
    normCite: 'friend2022',
    hrCite: 'kokkinos2022',
    sexStratifiedHR: false,
    /**
     * Get HR per unit (protective direction, <1) and divisor.
     * For VO2: hr_per_met = 0.86, divisor = 3.5 (so raw_hr = 0.86^(vo2/3.5))
     */
    getHRParams: function(sex, ciVariant) {
      var c = FRIEND_2022_CONTINUOUS.metadata.constants;
      var hr, kVar;
      if (ciVariant === 'lo') {
        hr = c.HR_per_MET_CI[0]; kVar = 'k_lo';
      } else if (ciVariant === 'hi') {
        hr = c.HR_per_MET_CI[1]; kVar = 'k_hi';
      } else {
        hr = c.HR_per_MET; kVar = 'k';
      }
      return { hr_per_unit: hr, divisor: c.MET_divisor, k_variant: kVar };
    },
  },
  grip: {
    dataset: function() { return GRIP_STRENGTH_DATA; },
    label: 'Grip strength',
    unit: 'kg',
    inputLabel: 'Grip strength (kg)',
    minValue: 1,
    maxValue: 120,
    minAge: 20,
    maxAge: 104,
    placeholder: 'e.g. 35',
    normCite: 'tomkinson2024',
    hrCite: 'celisMorales2018',
    sexStratifiedHR: true,
    /**
     * Get HR per unit for grip. Sex-stratified.
     * raw_hr = hr_per_unit^(grip/5)  where hr_per_unit = 1/HR_per_5kg_lower
     * Parallel to VO2: raw_hr = 0.86^(VO2/3.5)
     */
    getHRParams: function(sex, ciVariant) {
      var c = GRIP_STRENGTH_DATA.metadata.constants;
      var hr, kVar;
      if (ciVariant === 'lo') {
        hr = c.HR_per_unit_CI[sex][0]; kVar = 'k_lo';
      } else if (ciVariant === 'hi') {
        hr = c.HR_per_unit_CI[sex][1]; kVar = 'k_hi';
      } else {
        hr = c.HR_per_unit[sex]; kVar = 'k';
      }
      return { hr_per_unit: hr, divisor: c.unit_divisor, k_variant: kVar };
    },
  },
};

/**
 * Get the current metric ID. Defaults to 'vo2max'.
 */
function getCurrentMetric() {
  if (typeof document !== 'undefined') {
    var el = document.querySelector('input[name="metric"]:checked');
    if (el) return el.value;
  }
  return 'vo2max';
}

/**
 * Get metric registry entry.
 */
function getMetricInfo(metricId) {
  return METRIC_REGISTRY[metricId || getCurrentMetric()];
}

// ── Spline evaluation (unchanged, generic) ──────────────────────────────────

/**
 * Evaluate a piecewise polynomial spline at a single point.
 * Coefficients are in descending power order (Horner's method).
 * Outside the knot range, returns the endpoint value (flat tails).
 */
function evalSpline(spline, x) {
  var knots = spline.knots;
  var coeffs = spline.coeffs;
  var values = spline.values;

  if (x <= knots[0]) return values[0];
  if (x >= knots[knots.length - 1]) return values[values.length - 1];

  var lo = 0, hi = knots.length - 1;
  while (lo < hi - 1) {
    var mid = (lo + hi) >> 1;
    if (knots[mid] <= x) lo = mid;
    else hi = mid;
  }
  var i = lo;
  if (i >= coeffs.length) i = coeffs.length - 1;

  var c = coeffs[i];
  var t = x - knots[i];
  var val = c[0];
  for (var j = 1; j < c.length; j++) {
    val = val * t + c[j];
  }
  return val;
}

// ── Normalization constant lookup ───────────────────────────────────────────

/**
 * Get normalization constant k(age, sex, variant) from a dataset.
 */
function getNormalizationConstant(age, sex, variant, metricId) {
  variant = variant || 'k';
  var info = getMetricInfo(metricId);
  var dataset = info.dataset();
  var k_values = dataset.normalization[sex];

  var entry = k_values[String(age)];
  if (entry !== undefined) {
    return (typeof entry === 'object') ? entry[variant] : entry;
  }

  var ages = Object.keys(k_values).map(Number).sort(function(a, b) { return a - b; });
  if (age <= ages[0]) {
    var e = k_values[String(ages[0])];
    return (typeof e === 'object') ? e[variant] : e;
  }
  if (age >= ages[ages.length - 1]) {
    var e = k_values[String(ages[ages.length - 1])];
    return (typeof e === 'object') ? e[variant] : e;
  }

  for (var i = 0; i < ages.length - 1; i++) {
    if (age >= ages[i] && age <= ages[i + 1]) {
      var w = (age - ages[i]) / (ages[i + 1] - ages[i]);
      var e1 = k_values[String(ages[i])];
      var e2 = k_values[String(ages[i + 1])];
      var v1 = (typeof e1 === 'object') ? e1[variant] : e1;
      var v2 = (typeof e2 === 'object') ? e2[variant] : e2;
      return v1 * (1 - w) + v2 * w;
    }
  }
}

// ── Metric ↔ Percentile conversions ─────────────────────────────────────────

/**
 * Get metric value from age and percentile rank.
 */
function getMetricFromPercentile(age, percentile, sex, metricId) {
  var info = getMetricInfo(metricId);
  var dataset = info.dataset();
  var clampedAge = Math.max(info.minAge, Math.min(info.maxAge, Math.round(age)));
  var spline = dataset.percentile_splines[sex][String(clampedAge)];
  return evalSpline(spline, percentile);
}

/**
 * Get percentile rank from age and metric value.
 */
function getPercentileFromMetric(age, value, sex, metricId) {
  var info = getMetricInfo(metricId);
  var dataset = info.dataset();
  var clampedAge = Math.max(info.minAge, Math.min(info.maxAge, Math.round(age)));
  var spline = dataset.percentile_splines[sex][String(clampedAge)];
  var values = spline.values;
  var knots = spline.knots;

  if (value <= values[0]) return 0;
  if (value >= values[values.length - 1]) return 100;

  var nSteps = 200;
  var pLo = knots[0], pHi = knots[knots.length - 1];
  var step = (pHi - pLo) / nSteps;

  var prevP = pLo;
  var prevV = evalSpline(spline, prevP);

  for (var s = 1; s <= nSteps; s++) {
    var p = pLo + s * step;
    var v = evalSpline(spline, p);

    if ((prevV <= value && v >= value) ||
        (prevV >= value && v <= value)) {
      if (v === prevV) return (prevP + p) / 2;
      var w = (value - prevV) / (v - prevV);
      return prevP + w * (p - prevP);
    }

    prevP = p;
    prevV = v;
  }

  return null;
}

// ── Backward-compatible wrappers (VO2-specific) ─────────────────────────────

function getVo2FromPercentile(age, percentile, sex) {
  return getMetricFromPercentile(age, percentile, sex, 'vo2max');
}

function getPercentileFromVo2(age, vo2_mlkgmin, sex) {
  return getPercentileFromMetric(age, vo2_mlkgmin, sex, 'vo2max');
}

// ── Fitness hazard ratio ────────────────────────────────────────────────────

/**
 * Get continuous fitness hazard multiplier.
 *
 * raw_hr = hr_per_unit^(value / divisor)
 * fitness_hr = k(age, sex, variant) × raw_hr
 *
 * For VO2:  hr_per_unit = 0.86, divisor = 3.5 (so exponent = VO2/3.5 = METs)
 * For grip: hr_per_unit = (1/1.16)^(1/5) [men], divisor = 1.0 (so exponent = grip)
 */
function getNormalizedFitnessHR(age, value, sex, ciVariant, metricId) {
  ciVariant = ciVariant || 'central';
  var info = getMetricInfo(metricId);
  var params = info.getHRParams(sex, ciVariant);

  var exponent = value / params.divisor;
  var raw_hr = Math.pow(params.hr_per_unit, exponent);
  var k = getNormalizationConstant(age, sex, params.k_variant, metricId);
  return k * raw_hr;
}

// ── Module export (Node.js tests) ───────────────────────────────────────────

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    evalSpline: evalSpline,
    getNormalizationConstant: getNormalizationConstant,
    getMetricFromPercentile: getMetricFromPercentile,
    getPercentileFromMetric: getPercentileFromMetric,
    getVo2FromPercentile: getVo2FromPercentile,
    getPercentileFromVo2: getPercentileFromVo2,
    getNormalizedFitnessHR: getNormalizedFitnessHR,
    getMetricInfo: getMetricInfo,
    METRIC_REGISTRY: METRIC_REGISTRY,
  };
}
