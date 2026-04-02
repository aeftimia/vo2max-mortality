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
 *   friend-2022-continuous-model.js  → getNormalizedFitnessHR(), getPercentileFromVo2(), getVo2FromPercentile(), getNormalizationConstant()
 *   friend-2022-continuous-data.js   → FRIEND_2022_CONTINUOUS global
 *   risk-factors.js                  → computeRiskHR(), RISK_EQUIVALENTS
 */

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

  // ── Step 6: Continuous-model outputs ───────────────────────────────────────
  // Compute CI-propagated user ranges and life expectancy under the continuous model.

  // Plausible range from Kokkinos CI (HR = 0.86, 95% CI 0.85–0.87 per MET).
  // Each CI bound uses its own normalization constant so population-avg HR = 1.0
  // is preserved at every CI level.
  const fitnessHR_lo = getNormalizedFitnessHR(age, vo2max, sex, 'lo');
  const fitnessHR_hi = getNormalizedFitnessHR(age, vo2max, sex, 'hi');

  // User's fitness HR plausible range (from Kokkinos CI)
  // lo/hi are swapped: lower HR-per-MET (0.85) = more protective = lower mortality
  const qUserRange = {
    lo: qPop * fitnessHR_lo * userRiskHR,
    hi: qPop * fitnessHR_hi * userRiskHR,
  };

  // Life expectancy: population and current user
  const lePopulation = lifeExpectancy(age, sex, 1.0);
  const leCurrent = lifeExpectancy(age, sex, qUser / qPop);

  // LE plausible range for user (from qUserRange)
  const leUserRange = {
    lo: lifeExpectancy(age, sex, qUserRange.hi / qPop), // higher mortality -> lower LE
    hi: lifeExpectancy(age, sex, qUserRange.lo / qPop),
  };

  // ── Step 7: Return results ─────────────────────────────────────────────
  return {
    age, sex, vo2max, riskFactors,

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
