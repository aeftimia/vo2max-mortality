/**
 * Mortality Engine (Generalized Fitness Model)
 *
 * Core computation linking a fitness metric (VO2 max or grip strength) to
 * absolute annual mortality probability, anchored to SSA 2022 period life
 * tables and metric-specific continuous hazard ratios.
 *
 * MATHEMATICAL APPROACH
 * ---------------------
 * 1. Obtain population baseline mortality q_pop from SSA life table.
 *
 * 2. Compute continuous fitness hazard multiplier:
 *      HR_fitness(value) = k(age, sex) * hr_per_unit^(value / divisor)
 *
 *    where k(age, sex) is the normalization constant ensuring population-
 *    averaged HR = 1.0.
 *
 *    VO2 max:       hr_per_unit = 0.86, divisor = 3.5 (Kokkinos 2022)
 *    Grip strength: hr_per_unit = (1/1.16)^(1/5) [men] or (1/1.20)^(1/5) [women],
 *                   divisor = 1.0 (Celis-Morales 2018)
 *
 * 3. User's mortality:
 *      q_user = q_pop * HR_fitness(value) * HR_risk_factors
 *
 * 4. Excess mortality for hypothetical target:
 *      dq(target) = q_pop * (HR_fitness(target) - HR_fitness(current)) * HR_risk
 *
 * 5. Express dq in risk equivalent units.
 *
 * Dependencies (must be loaded before this file):
 *   ssa-life-tables.js     -> getQx(), lifeExpectancy()
 *   fitness-model.js       -> getNormalizedFitnessHR(), getPercentileFromMetric(),
 *                             getMetricFromPercentile(), getNormalizationConstant()
 *   grip-strength-data.js  -> GRIP_STRENGTH_DATA global
 *   friend-2022-continuous-data.js -> FRIEND_2022_CONTINUOUS global
 *   risk-factors.js        -> computeRiskHR(), RISK_EQUIVALENTS
 */

/**
 * Main computation function.
 *
 * @param {Object} inputs
 * @param {number}   inputs.age          Integer age (18-99)
 * @param {'male'|'female'} inputs.sex
 * @param {number}   inputs.metricValue  Fitness metric value (VO2 in mL/kg/min or grip in kg)
 * @param {string}   inputs.metric       Metric ID: 'vo2max' | 'grip'
 * @param {string[]} inputs.riskFactors  Array of selected risk factor IDs
 *
 * @returns {Object} result
 */
function computeMortality(inputs) {
  var age = inputs.age;
  var sex = inputs.sex;
  var metricValue = inputs.metricValue;
  var metric = inputs.metric || 'vo2max';
  var riskFactors = inputs.riskFactors;

  // Backward compat: accept vo2max field
  if (metricValue === undefined && inputs.vo2max !== undefined) {
    metricValue = inputs.vo2max;
    metric = 'vo2max';
  }

  var info = getMetricInfo(metric);

  // -- Step 1: Population baseline mortality from SSA life table
  var qPop = getQx(age, sex);

  // -- Step 2: Fitness hazard multiplier (continuous)
  var fitnessHR = getNormalizedFitnessHR(age, metricValue, sex, 'central', metric);

  // -- Step 3: Apply user risk factors
  var userRiskHR = computeRiskHR(riskFactors);

  // -- Step 4: User's personal annual mortality
  var qUser = qPop * fitnessHR * userRiskHR;

  // -- Step 5: Estimate percentile for display
  var percentile = getPercentileFromMetric(age, metricValue, sex, metric);
  var percentileDisplay = percentile !== null
    ? Math.max(1, Math.min(99, Math.round(percentile)))
    : null;

  // -- Step 6: CI-propagated ranges and life expectancy
  var fitnessHR_lo = getNormalizedFitnessHR(age, metricValue, sex, 'lo', metric);
  var fitnessHR_hi = getNormalizedFitnessHR(age, metricValue, sex, 'hi', metric);

  var qUserRange = {
    lo: qPop * fitnessHR_lo * userRiskHR,
    hi: qPop * fitnessHR_hi * userRiskHR,
  };

  var lePopulation = lifeExpectancy(age, sex, 1.0);
  var leCurrent = lifeExpectancy(age, sex, qUser / qPop);

  var leUserRange = {
    lo: lifeExpectancy(age, sex, qUserRange.hi / qPop),
    hi: lifeExpectancy(age, sex, qUserRange.lo / qPop),
  };

  // -- Step 7: Return results
  return {
    age: age, sex: sex, metric: metric, metricValue: metricValue,
    riskFactors: riskFactors,

    // Backward compat
    vo2max: metric === 'vo2max' ? metricValue : undefined,

    // Metric info for display
    metricLabel: info.label,
    metricUnit: info.unit,

    // Percentile
    friendPercentile: percentileDisplay,

    // Population baseline
    qPop: qPop,

    // Continuous fitness hazard multiplier
    fitnessHR: fitnessHR,

    // User's current annual mortality
    qUser: qUser,

    // Combined user risk HR
    userRiskHR: userRiskHR,

    // CI-based user ranges
    qUserRange: qUserRange,

    // Life expectancy
    lePopulation: lePopulation,
    leCurrent: leCurrent,
    leUserRange: leUserRange,
  };
}
