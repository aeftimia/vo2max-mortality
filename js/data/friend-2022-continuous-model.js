/**
 * Continuous VO2 Max Fitness Model — Piecewise Quadratic Spline Evaluator
 *
 * Evaluates precomputed piecewise-quadratic spline coefficients exported by
 * scripts/fit_friend_splines.py.  Two interpolation methods are used:
 *
 *   Age direction:        Monotone quadratic histospline (bin-average preserving)
 *   Percentile direction: Monotone quadratic spline with flat tails (<10th, >90th)
 *
 * The JSON data (friend-2022-continuous.json) contains:
 *   - percentile_splines[sex][age]: {knots, coeffs, values}
 *   - normalization[sex][age]: k value
 *
 * References:
 * [1] Kaminsky LA, et al. Mayo Clin Proc. 2022;97(2):285–293.
 * [2] Kokkinos P, et al. J Am Coll Cardiol. 2022;80(6):598–609.
 */

// Populated by friend-2022-loader.js (browser) or injected in tests (Node)
const FRIEND_2022_CONTINUOUS = (typeof window !== 'undefined')
  ? window.FRIEND_2022_CONTINUOUS || {}
  : global.FRIEND_2022_CONTINUOUS || {};

/**
 * Evaluate a piecewise-quadratic spline at a single point.
 *
 * Each piece: q(t) = a*t² + b*t + c, where t = x - knot[i].
 * Outside the knot range, returns the endpoint value (flat tails).
 *
 * @param {Object} spline - {knots: number[], coeffs: number[][], values: number[]}
 * @param {number} x - evaluation point
 * @returns {number}
 */
function evalQuadraticSpline(spline, x) {
  var knots = spline.knots;
  var coeffs = spline.coeffs;
  var values = spline.values;

  // Flat tails
  if (x <= knots[0]) return values[0];
  if (x >= knots[knots.length - 1]) return values[values.length - 1];

  // Binary search for the interval
  var lo = 0, hi = knots.length - 1;
  while (lo < hi - 1) {
    var mid = (lo + hi) >> 1;
    if (knots[mid] <= x) lo = mid;
    else hi = mid;
  }
  var i = lo;
  if (i >= coeffs.length) i = coeffs.length - 1;

  var abc = coeffs[i];
  var t = x - knots[i];
  return abc[0] * t * t + abc[1] * t + abc[2];
}

/**
 * Get normalization constant k(age, sex, variant).
 *
 * Each (age, sex) has three precomputed k values, one per HR-per-MET:
 *   k    — central estimate (HR = 0.86 per MET)
 *   k_lo — lower CI bound  (HR = 0.85 per MET, more protective → higher k)
 *   k_hi — upper CI bound  (HR = 0.87 per MET, less protective → lower k)
 *
 * @param {number} age - integer age (20–89)
 * @param {'male'|'female'} sex
 * @param {'k'|'k_lo'|'k_hi'} [variant='k'] - which normalization constant
 * @returns {number}
 */
function getNormalizationConstant(age, sex, variant) {
  variant = variant || 'k';

  if (!FRIEND_2022_CONTINUOUS.normalization ||
      !FRIEND_2022_CONTINUOUS.normalization[sex]) {
    console.error('ERROR: No normalization data for sex=' + sex);
    return 1.0;
  }

  var k_values = FRIEND_2022_CONTINUOUS.normalization[sex];

  // Direct lookup for integer ages
  var entry = k_values[String(age)];
  if (entry !== undefined) {
    return (typeof entry === 'object') ? entry[variant] : entry;
  }

  // Linear interpolation between available ages
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

  return 1.0;
}

/**
 * Get VO2 max from age and percentile rank.
 *
 * Uses piecewise-quadratic spline coefficients spanning [0, 100].
 * p=0 is the physiological floor (~10 mL/kg/min); p=100 mirrors the 80→90 gap.
 *
 * @param {number} age - integer age (20–89)
 * @param {number} percentile - rank 0–100
 * @param {'male'|'female'} sex
 * @returns {number} VO2 max in mL/kg/min
 */
function getVo2FromPercentile(age, percentile, sex) {
  if (!FRIEND_2022_CONTINUOUS.percentile_splines ||
      !FRIEND_2022_CONTINUOUS.percentile_splines[sex]) {
    console.error('ERROR: No spline data for sex=' + sex);
    return 30;
  }

  // Clamp age to available range
  var clampedAge = Math.max(20, Math.min(89, Math.round(age)));
  var spline = FRIEND_2022_CONTINUOUS.percentile_splines[sex][String(clampedAge)];

  if (!spline) {
    console.error('ERROR: No spline for age=' + clampedAge + ', sex=' + sex);
    return 30;
  }

  return evalQuadraticSpline(spline, percentile);
}

/**
 * Inverse: Get percentile rank from age and VO2 max.
 *
 * Evaluates the spline at a fine grid and interpolates.
 * Returns null if VO2 is outside the measurable range.
 *
 * @param {number} age - integer age (20–89)
 * @param {number} vo2_mlkgmin - VO2 in mL/kg/min
 * @param {'male'|'female'} sex
 * @returns {number|null} percentile rank (0–100), or null if unmeasurable
 */
function getPercentileFromVo2(age, vo2_mlkgmin, sex) {
  if (!FRIEND_2022_CONTINUOUS.percentile_splines ||
      !FRIEND_2022_CONTINUOUS.percentile_splines[sex]) {
    return null;
  }

  var clampedAge = Math.max(20, Math.min(89, Math.round(age)));
  var spline = FRIEND_2022_CONTINUOUS.percentile_splines[sex][String(clampedAge)];
  if (!spline) return null;

  var values = spline.values;
  var knots = spline.knots;

  // Below the 0th-percentile floor
  if (vo2_mlkgmin <= values[0]) return 0;
  // Above the 100th-percentile ceiling
  if (vo2_mlkgmin >= values[values.length - 1]) return 100;

  // Search through spline pieces
  var nSteps = 200;
  var pLo = knots[0], pHi = knots[knots.length - 1];
  var step = (pHi - pLo) / nSteps;

  var prevP = pLo;
  var prevV = evalQuadraticSpline(spline, prevP);

  for (var s = 1; s <= nSteps; s++) {
    var p = pLo + s * step;
    var v = evalQuadraticSpline(spline, p);

    if ((prevV <= vo2_mlkgmin && v >= vo2_mlkgmin) ||
        (prevV >= vo2_mlkgmin && v <= vo2_mlkgmin)) {
      if (v === prevV) return (prevP + p) / 2;
      var w = (vo2_mlkgmin - prevV) / (v - prevV);
      return prevP + w * (p - prevP);
    }

    prevP = p;
    prevV = v;
  }

  return null;
}

/**
 * Get continuous fitness hazard multiplier.
 *
 * raw_hr = hr_per_met^(VO2 / 3.5)
 * fitness_hr = k(age, sex, variant) × raw_hr
 *
 * @param {number} age
 * @param {number} vo2_mlkgmin
 * @param {'male'|'female'} sex
 * @param {'central'|'lo'|'hi'} [ciVariant='central'] - which HR-per-MET to use
 * @returns {number} hazard multiplier
 */
function getNormalizedFitnessHR(age, vo2_mlkgmin, sex, ciVariant) {
  ciVariant = ciVariant || 'central';

  var HR_CENTRAL = 0.86;
  var HR_LO = 0.85;
  var HR_HI = 0.87;

  var hr_per_met, k_variant;
  if (ciVariant === 'lo') {
    hr_per_met = HR_LO;
    k_variant = 'k_lo';
  } else if (ciVariant === 'hi') {
    hr_per_met = HR_HI;
    k_variant = 'k_hi';
  } else {
    hr_per_met = HR_CENTRAL;
    k_variant = 'k';
  }

  var MET = vo2_mlkgmin / 3.5;
  var raw_hr = Math.pow(hr_per_met, MET);
  var k = getNormalizationConstant(age, sex, k_variant);
  return k * raw_hr;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    evalQuadraticSpline: evalQuadraticSpline,
    getNormalizationConstant: getNormalizationConstant,
    getVo2FromPercentile: getVo2FromPercentile,
    getPercentileFromVo2: getPercentileFromVo2,
    getNormalizedFitnessHR: getNormalizedFitnessHR,
  };
}
