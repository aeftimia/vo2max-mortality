/**
 * Mortality Engine
 *
 * Core computation linking VO2 max fitness level to absolute annual mortality
 * probability, anchored to SSA 2021 period life tables and Mandsager 2018
 * hazard ratios.
 *
 * MATHEMATICAL APPROACH
 * ─────────────────────
 * 1. Obtain population baseline mortality q_pop from SSA life table.
 *
 * 2. Compute fitness-stratified mortality:
 *      H_bar = Σ(f_i × HR_i)      [population-weighted average HR]
 *      q_i   = q_pop × HR_i / H_bar
 *
 *    Each group's mortality is the population rate scaled by how far its
 *    HR is above or below the weighted average. No single category is
 *    treated as a special reference — every group is computed the same way.
 *
 *    Assumption: Mandsager's proportional hazards between categories hold
 *    in the general population. The absolute mortality in Mandsager's
 *    clinical cohort is higher (referral bias), but the *ratios* are
 *    assumed transferable to the general population.
 *
 * 3. Apply user risk factors multiplicatively:
 *      HR_user = Π(HR_rf)          [independent risks — an approximation]
 *      q_user_i = q_i × HR_user
 *
 * 4. Excess mortality vs current fitness level:
 *      Δq(target) = q_user[target] − q_user[current]
 *
 * 5. Express Δq in risk equivalent units (base jumps, anesthesias, skydives).
 *
 * Dependencies (must be loaded before this file):
 *   ssa-life-tables.js  → getQx(), lifeExpectancy()
 *   mandsager.js        → MANDSAGER_HR, MANDSAGER_FRACTIONS, MANDSAGER_W,
 *                         classifyMandsager(), getCategoryBounds()
 *   friend-registry.js  → estimateFriendPercentile()
 *   risk-factors.js     → computeRiskHR(), RISK_EQUIVALENTS
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

  // ── Step 2: Fitness-stratified mortality ───────────────────────────────────
  // H_bar = Σ(f_i × HR_i)  — population-weighted average HR
  // q_i   = q_pop × HR_i / H_bar
  const H_bar = MANDSAGER_W;  // pre-computed constant ≈ 0.630

  const qByCategory = {};
  for (const cat of CATEGORIES) {
    qByCategory[cat] = qPop * MANDSAGER_HR[cat].hr / H_bar;
  }

  // ── Step 3: Apply user risk factors ───────────────────────────────────────
  const userRiskHR = computeRiskHR(riskFactors);

  const qUserByCategory = {};
  for (const cat of CATEGORIES) {
    qUserByCategory[cat] = qByCategory[cat] * userRiskHR;
  }

  // ── Step 4: Current category and user's personal mortality ────────────────
  const currentCategory = classifyMandsager(vo2max, age, sex);
  const qUser = qUserByCategory[currentCategory];

  // ── Step 5: Excess mortality vs current (for every other category) ────────
  const deltaQ = {};
  const riskEquivByCategory = {};

  for (const cat of CATEGORIES) {
    const dq = qUserByCategory[cat] - qUser;
    deltaQ[cat] = dq;

    // Express excess mortality in risk equivalent units
    const equivs = {};
    for (const re of RISK_EQUIVALENTS) {
      equivs[re.id] = dq / re.mortalityPerEvent;
    }
    riskEquivByCategory[cat] = equivs;
  }

  // ── Step 6: Plausible ranges (CI propagation) ─────────────────────────────
  // Conservative bounds using HR 95% CIs. Not a formal joint CI.
  // H_bar_hi uses upper CI bounds; H_bar_lo uses lower CI bounds.
  const H_bar_hi = CATEGORIES.reduce((s, c) =>
    s + MANDSAGER_FRACTIONS[c] * MANDSAGER_HR[c].ci[1], 0);
  const H_bar_lo = CATEGORIES.reduce((s, c) =>
    s + MANDSAGER_FRACTIONS[c] * MANDSAGER_HR[c].ci[0], 0);

  const qRangeByCategory = {};
  for (const cat of CATEGORIES) {
    const hrLo = MANDSAGER_HR[cat].ci[0];
    const hrHi = MANDSAGER_HR[cat].ci[1];
    qRangeByCategory[cat] = {
      lo: qPop * hrLo / H_bar_hi * userRiskHR,
      hi: qPop * hrHi / H_bar_lo * userRiskHR,
    };
  }

  // Delta-q plausible range vs current category
  const deltaQRangeByCategory = {};
  const curLo = qRangeByCategory[currentCategory].lo;
  const curHi = qRangeByCategory[currentCategory].hi;
  for (const cat of CATEGORIES) {
    deltaQRangeByCategory[cat] = {
      lo: qRangeByCategory[cat].lo - curHi,
      hi: qRangeByCategory[cat].hi - curLo,
    };
  }

  // Risk equivalent ranges (N events at lo/hi of delta-q range)
  const riskEquivRangeByCategory = {};
  for (const cat of CATEGORIES) {
    const equivs = {};
    for (const re of RISK_EQUIVALENTS) {
      equivs[re.id] = {
        lo: deltaQRangeByCategory[cat].lo / re.mortalityPerEvent,
        hi: deltaQRangeByCategory[cat].hi / re.mortalityPerEvent,
      };
    }
    riskEquivRangeByCategory[cat] = equivs;
  }

  // ── Step 7: Life expectancy impact ───────────────────────────────────────
  // Compute remaining LE for each category relative to population average,
  // then express delta vs current category.
  const leByCategory = {};
  for (const cat of CATEGORIES) {
    const mult = qUserByCategory[cat] / qPop;
    leByCategory[cat] = lifeExpectancy(age, sex, mult);
  }
  const lePopulation = lifeExpectancy(age, sex, 1.0);
  const leDeltaByCategory = {};
  for (const cat of CATEGORIES) {
    leDeltaByCategory[cat] = leByCategory[cat] - leByCategory[currentCategory];
  }

  // LE plausible range (CI propagation)
  const leRangeByCategory = {};
  for (const cat of CATEGORIES) {
    const multLo = qRangeByCategory[cat].lo / qPop;
    const multHi = qRangeByCategory[cat].hi / qPop;
    leRangeByCategory[cat] = {
      lo: lifeExpectancy(age, sex, multHi),  // higher mortality → lower LE
      hi: lifeExpectancy(age, sex, multLo),  // lower mortality → higher LE
    };
  }
  // LE delta range vs current category
  const leDeltaRangeByCategory = {};
  const curLeLo = leRangeByCategory[currentCategory].lo;
  const curLeHi = leRangeByCategory[currentCategory].hi;
  for (const cat of CATEGORIES) {
    leDeltaRangeByCategory[cat] = {
      lo: leRangeByCategory[cat].lo - curLeHi,
      hi: leRangeByCategory[cat].hi - curLeLo,
    };
  }

  // ── Step 8: FRIEND peer percentile (context only) ────────────────────────
  const friendPercentile = estimateFriendPercentile(vo2max, age, sex);

  // ── Step 9: VO2 max category boundaries for display ──────────────────────
  const categoryBounds = getCategoryBounds(age, sex);

  return {
    // Inputs (echoed back for rendering)
    age, sex, vo2max, riskFactors,

    // Classification
    currentCategory,
    categoryLabel: CAT_LABEL[currentCategory],
    friendPercentile: Math.round(friendPercentile),
    categoryBounds,

    // Population baseline
    qPop,

    // Per-category mortality (no user risk adjustment)
    qByCategory,

    // Per-category mortality (with user risk factors applied)
    qUserByCategory,

    // User's current annual mortality
    qUser,

    // Combined user risk HR
    userRiskHR,

    // Weighted average HR (normalization constant)
    H_bar,

    // Excess mortality vs current category
    deltaQ,

    // Risk equivalents (N events worth of annual excess mortality)
    riskEquivByCategory,
    riskEquivRangeByCategory,

    // Plausible range (CI-based)
    qRangeByCategory,
    deltaQRangeByCategory,

    // Life expectancy
    leByCategory,
    lePopulation,
    leDeltaByCategory,
    leRangeByCategory,
    leDeltaRangeByCategory,
  };
}
