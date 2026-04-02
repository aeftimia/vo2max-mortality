/**
 * Continuous VO2 Max Fitness Model Data
 * 
 * Compiled from FRIEND 2022 percentile norms and Kokkinos 2022 hazard ratios.
 * Replaces the 5-bin Mandsager categorical approach with smooth, continuous splines.
 * 
 * References:
 * [1] Kaminsky LA, et al. Updated Reference Standards for Cardiorespiratory 
 *     Fitness Measured with Cardiopulmonary Exercise Testing: Data from the 
 *     Fitness Registry and the Importance of Exercise National Database (FRIEND).
 *     Mayo Clin Proc. 2022;97(2):285–293. 
 *     DOI: 10.1016/j.mayocp.2021.08.020
 *
 * [2] Kokkinos P, et al. Cardiorespiratory Fitness and Mortality Risk Across 
 *     the Spectra of Age, Race, and Sex. 
 *     J Am Coll Cardiol. 2022;80(6):598–609. 
 *     DOI: 10.1016/j.jacc.2022.05.031
 *     Adjusted HR = 0.86 (95% CI: 0.85–0.87) per +1 MET increase.
 *     Consistent across age, sex, and racial groups.
 * 
 * Data Structure:
 *  - normalization: k(age, sex) such that population-averaged HR = 1.0
 *  - grids: dense lookup tables for VO2(age, percentile, sex)
 */

// Global object to hold FRIEND 2022 continuous model data
// Populated by friend-2022-loader.js via fetch of friend-2022-continuous.json
// In Node tests the JSON is injected into global.FRIEND_2022_CONTINUOUS before requiring this module.
var FRIEND_2022_CONTINUOUS;
if (typeof global !== 'undefined' && global.FRIEND_2022_CONTINUOUS) {
  FRIEND_2022_CONTINUOUS = global.FRIEND_2022_CONTINUOUS;
} else if (typeof window !== 'undefined' && window.FRIEND_2022_CONTINUOUS) {
  FRIEND_2022_CONTINUOUS = window.FRIEND_2022_CONTINUOUS;
} else if (typeof window !== 'undefined' && window.FRIEND_2022_EMBED) {
  // fallback for file:// testing in browsers
  FRIEND_2022_CONTINUOUS = window.FRIEND_2022_EMBED;
} else {
  FRIEND_2022_CONTINUOUS = {};
}

/**
 * Get normalization constant k(age, sex).
 * 
 * k(age, sex) ensures that when we compute:
 *   fitness_HR = k × 0.86^(VO2 / 3.5)
 * 
 * the population-averaged fitness_HR (integrated over uniform percentile ranks)
 * equals exactly 1.0. This maintains the property that population baseline 
 * mortality is preserved.
 * 
 * @param {number} age - integer age (20-89)
 * @param {'male'|'female'} sex
 * @returns {number} normalization constant k(age, sex)
 */
function getNormalizationConstant(age, sex) {
  if (!FRIEND_2022_CONTINUOUS.normalization || 
      !FRIEND_2022_CONTINUOUS.normalization[sex]) {
    console.error(`ERROR: No normalization data for sex=${sex}. FRIEND 2022 model did not load correctly.`);
    return 1.0;  // fallback for UI not to crash, but error is logged
  }
  
  const k_values = FRIEND_2022_CONTINUOUS.normalization[sex];
  
  // Find closest age or interpolate
  const ages = Object.keys(k_values).map(Number).sort((a, b) => a - b);
  
  if (age <= ages[0]) return k_values[ages[0]];
  if (age >= ages[ages.length - 1]) return k_values[ages[ages.length - 1]];
  
  // Linear interpolation
  for (let i = 0; i < ages.length - 1; i++) {
    const a1 = ages[i];
    const a2 = ages[i + 1];
    if (age >= a1 && age <= a2) {
      const k1 = k_values[a1];
      const k2 = k_values[a2];
      const w = (age - a1) / (a2 - a1);
      return k1 + w * (k2 - k1);
    }
  }
  
  return 1.0;
}

/**
 * Get VO2 max from age and percentile rank (continuous).
 * 
 * @param {number} age - integer age (20-89)
 * @param {number} percentile - rank 0-100 (or 1-99 for FRIEND data)
 * @param {'male'|'female'} sex
 * @returns {number} VO2 max in mL/kg/min
 */
function getVo2FromPercentile(age, percentile, sex) {
  if (!FRIEND_2022_CONTINUOUS.grids ||
      !FRIEND_2022_CONTINUOUS.grids[sex] ||
      !FRIEND_2022_CONTINUOUS.grids[sex][age]) {
    console.error(`ERROR: No grid data for age=${age}, sex=${sex}. FRIEND 2022 model did not load correctly.`);
    return 30; // fallback for UI not to crash, but error is logged
  }
  
  // Clamp percentile to available range
  const clampedPercentile = Math.max(1, Math.min(99, percentile));
  
  const grid = FRIEND_2022_CONTINUOUS.grids[sex][age];
  const p_lower = Math.floor(clampedPercentile);
  const p_upper = Math.ceil(clampedPercentile);
  
  if (p_lower === p_upper) {
    return grid[p_lower] || 30;
  }
  
  const vo2_lower = grid[p_lower] || 30;
  const vo2_upper = grid[p_upper] || 30;
  const w = clampedPercentile - p_lower;
  
  return vo2_lower + w * (vo2_upper - vo2_lower);
}

/**
 * Inverse: Get percentile rank from age and VO2 max (continuous).
 * 
 * Uses grid lookup with linear interpolation.
 * Returns null if VO2 is outside measurable range (< p1 or > p99).
 * 
 * @param {number} age - integer age (20-89)
 * @param {number} vo2_mlkgmin - VO2 in mL/kg/min
 * @param {'male'|'female'} sex
 * @returns {number|null} percentile rank (0-100), or null if unmeasurable
 */
function getPercentileFromVo2(age, vo2_mlkgmin, sex) {
  if (!FRIEND_2022_CONTINUOUS.grids ||
      !FRIEND_2022_CONTINUOUS.grids[sex] ||
      !FRIEND_2022_CONTINUOUS.grids[sex][age]) {
    return null;
  }
  
  const grid = FRIEND_2022_CONTINUOUS.grids[sex][age];
  const percentiles = Object.keys(grid).map(Number).sort((a, b) => a - b);
  
  if (percentiles.length === 0) return null;
  
  // Get VO2 values at each percentile
  const vo2_values = percentiles.map(p => grid[p]);
  
  // Check bounds
  if (vo2_mlkgmin < vo2_values[0]) {
    return 0; // below 1st percentile
  }
  if (vo2_mlkgmin > vo2_values[vo2_values.length - 1]) {
    return 100; // above 99th percentile
  }
  
  // Find bracket and interpolate
  for (let i = 0; i < percentiles.length - 1; i++) {
    const v1 = vo2_values[i];
    const v2 = vo2_values[i + 1];
    if (vo2_mlkgmin >= v1 && vo2_mlkgmin <= v2) {
      const p1 = percentiles[i];
      const p2 = percentiles[i + 1];
      const w = (v2 === v1) ? 0 : (vo2_mlkgmin - v1) / (v2 - v1);
      return p1 + w * (p2 - p1);
    }
  }
  
  return null;
}

/**
 * Get continuous fitness hazard multiplier.
 * 
 * Implements Kokkinos 2022 hazard ratio: 0.86 (95% CI: 0.85–0.87) per +1 MET.
 * DOI: 10.1016/j.jacc.2022.05.031
 * 
 * raw_hr = 0.86^(VO2 / 3.5)
 * fitness_hr = k(age, sex) × raw_hr
 * 
 * This ensures that the population-averaged fitness_hr (integrated over uniform 
 * percentile ranks) equals exactly 1.0, preserving the baseline mortality from 
 * SSA life tables.
 * 
 * The hazard ratio is:
 *  - Continuous and smooth (no discontinuities)
 *  - Monotone decreasing in VO2 (higher fitness → lower risk)
 *  - Consistent across age, sex, and racial groups (no interactions)
 * 
 * @param {number} age
 * @param {number} vo2_mlkgmin - VO2 in mL/kg/min
 * @param {'male'|'female'} sex
 * @returns {number} hazard multiplier (typically 0.3–3.0)
 */
function getNormalizedFitnessHR(age, vo2_mlkgmin, sex) {
  const MET = vo2_mlkgmin / 3.5;
  const HR_PER_MET = 0.86;
  const raw_hr = Math.pow(HR_PER_MET, MET);
  
  const k = getNormalizationConstant(age, sex);
  return k * raw_hr;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    getNormalizationConstant,
    getVo2FromPercentile,
    getPercentileFromVo2,
    getNormalizedFitnessHR,
  };
}
