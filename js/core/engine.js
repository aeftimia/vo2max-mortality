/**
 * Mortality Engine (Continuous VO2 Model)
 *
 * Core computation linking VO2 max fitness level to absolute annual mortality
 * probability, anchored to SSA 2022 period life tables and Kokkinos 2022
 * continuous hazard ratios (0.86 per +1 MET, 95% CI 0.85–0.87).
 *
 * MATHEMATICAL APPROACH
 * ─────────────────────
 * 1. Obtain population baseline mortality q_pop from SSA life table.
 *
 * 2. Compute continuous fitness hazard multiplier:
 *      HR_fitness(VO2) = k(age, sex) × 0.86^(VO2 / 3.5)
 *
 *    where k(age, sex) is the normalization constant computed such that the
 *    population-averaged HR (integrated over uniform percentile ranks) equals 1.0.
 *    This ensures that the average mortality in the population is preserved.
 *
 *    Reference: Kokkinos P, et al. Cardiorespiratory Fitness and Mortality Risk
 *    Across the Spectra of Age, Race, and Sex. J Am Coll Cardiol. 2022;80(6):598–609.
 *    DOI: 10.1016/j.jacc.2022.05.031
 *    Adjusted HR = 0.86 (95% CI: 0.85–0.87) per +1 MET, consistent across age,
 *    sex, and racial groups.
 *
 *    The k-constant is derived from FRIEND 2022 percentile norms (Kaminsky LA, et al.
 *    Updated Reference Standards for Cardiorespiratory Fitness Measured with 
 *    Cardiopulmonary Exercise Testing: Data from the Fitness Registry and the 
 *    Importance of Exercise National Database (FRIEND). Mayo Clin Proc. 2022;97(2):285-293.
 *    DOI: 10.1016/j.mayocp.2021.08.020).
 *
 * 3. User's mortality for their current VO2:
 *      q_user = q_pop × HR_fitness(VO2_current) × HR_risk_factors
 *
 * 4. Excess mortality vs current fitness level (for hypothetical target VO2):
 *      Δq(target) = q_pop × (HR_fitness(VO2_target) - HR_fitness(VO2_current)) × HR_risk_factors
 *
 * 5. Express Δq in risk equivalent units (base jumps, anesthesias, skydives).
 *
 * Dependencies (must be loaded before this file):
 *   ssa-life-tables.js               → getQx(), lifeExpectancy()
 *   (legacy) mandsager.js            → legacy category helpers (no longer required)
 *                                      classifyMandsager(), getCategoryBounds()
 *   friend-2022-continuous-model.js  → getNormalizedFitnessHR(), getPercentileFromVo2(), getVo2FromPercentile(), getNormalizationConstant()
 *   friend-2022-loader.js            → loads friend-2022-continuous.json
 *   friend-2022-continuous-model.js  → getNormalizedFitnessHR(), getPercentileFromVo2()
 *   risk-factors.js                  → computeRiskHR(), RISK_EQUIVALENTS
 */

const CATEGORIES = ['Low', 'BelowAvg', 'AboveAvg', 'High', 'Elite'];

// Category labels: use CAT_LABEL from formatter.js (single source of truth)

/**
 * Main computation function.
 *
 * @param {Object} inputs
 * @param {number}   inputs.age          Integer age (18–99)
 * @param {'male'|'female'} inputs.sex
 * @param {number}   inputs.vo2max       VO2 max in mL/kg/min
 * @param {string[]} inputs.riskFactors  Array of selected risk factor IDs
 *
 * @returns {Object} result (see inline documentation below)
 */
function computeMortality(inputs) {
  const { age, sex, vo2max, riskFactors } = inputs;

  // ── Step 1: Population baseline mortality from SSA life table ─────────────
  const qPop = getQx(age, sex);

  // ── Step 2: Fitness hazard multiplier (continuous) ──────────────────────────
  // HR_fitness = k(age, sex) × 0.86^(VO2 / 3.5)
  // where k ensures population-averaged HR = 1.0
  // 
  // Kokkinos et al. 2022: adjusted HR = 0.86 (95% CI: 0.85–0.87) per +1 MET
  // Consistent across age, sex, and racial groups.
  // DOI: 10.1016/j.jacc.2022.05.031
  const fitnessHR = getNormalizedFitnessHR(age, vo2max, sex);

  // ── Step 3: Apply user risk factors ───────────────────────────────────────
  const userRiskHR = computeRiskHR(riskFactors);

  // ── Step 4: User's personal annual mortality ────────────────────────────────
  const qUser = qPop * fitnessHR * userRiskHR;

  // ── Step 5: Estimate FRIEND percentile for display ────────────────────────
  const friendPercentile = getPercentileFromVo2(age, vo2max, sex);
  const friendPercentileDisplay = friendPercentile !== null
    ? Math.max(1, Math.min(99, Math.round(friendPercentile)))
    : null;

  // ── Step 6: Continuous-model outputs (legacy categorical outputs removed) ───
  // The calculator no longer uses Mandsager categories for computation or display.
  // Compute CI-propagated user ranges and life expectancy under the continuous model.

  // For continuous model: use CI from Kokkinos (HR = 0.86, CI 0.85-0.87 per MET)
  const MET = vo2max / 3.5;
  const HR_LO = Math.pow(0.85, MET);
  const HR_HI = Math.pow(0.87, MET);

  // k-constant and small spline-fit margin
  const k = getNormalizationConstant(age, sex);
  const k_margin = k * 0.01;

  // User's fitness HR plausible range (from Kokkinos CI)
  const qUserRange = {
    lo: qPop * (k - k_margin) * HR_LO * userRiskHR,
    hi: qPop * (k + k_margin) * HR_HI * userRiskHR,
  };

  // Life expectancy: population and current user
  const lePopulation = lifeExpectancy(age, sex, 1.0);
  const leCurrent = lifeExpectancy(age, sex, qUser / qPop);

  // LE plausible range for user (from qUserRange)
  const leUserRange = {
    lo: lifeExpectancy(age, sex, qUserRange.hi / qPop), // higher mortality -> lower LE
    hi: lifeExpectancy(age, sex, qUserRange.lo / qPop),
  };

  // ── Step 10: Life expectancy impact ──────────────────────────────────────
  // Compute remaining LE using continuous model
  // Remove legacy per-category LE calculations (they depended on removed arrays).

  // Return continuous-model outputs
  return {
    // Inputs (echoed back for rendering)
    age, sex, vo2max, riskFactors,

    // Classification (legacy category removed). Provide percentile only.
    friendPercentile: friendPercentileDisplay,

    // Population baseline
    qPop,

    // Continuous fitness hazard multiplier
    fitnessHR,

    // User's current annual mortality
    qUser,

    // Combined user risk HR
    userRiskHR,

    // CI-based user ranges
    qUserRange,

    // Life expectancy
    lePopulation,
    leCurrent,
    leUserRange,
  };
}
