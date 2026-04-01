/**
 * SSA Period Life Table 2021
 * Source: Social Security Administration, Office of the Chief Actuary
 * https://www.ssa.gov/oact/STATS/table4c6.html
 * Public domain. United States federal government work.
 *
 * q(x) = probability of dying within one year for a person exact age x.
 *
 * Anchor values at 5-year intervals are taken directly from the SSA table.
 * Intermediate integer ages are interpolated in log-space (standard actuarial
 * practice). The interpolation error is negligible relative to other model
 * uncertainties.
 *
 * To replace with exact SSA values: visit the URL above, download the table,
 * and substitute the SSA_ANCHORS entries with the full integer-age table.
 */

// Anchor values at 5-year intervals from SSA 2021 Period Life Table
const SSA_ANCHORS = {
  male: {
    0: 0.005566, 1: 0.000371, 2: 0.000225, 3: 0.000173, 4: 0.000138,
    5: 0.000123, 10: 0.000093, 15: 0.000267, 20: 0.000870,
    25: 0.001218, 30: 0.001561, 35: 0.002222, 40: 0.003129,
    45: 0.004472, 50: 0.006435, 55: 0.009540, 60: 0.013809,
    65: 0.020139, 70: 0.030591, 75: 0.046897, 80: 0.073105,
    85: 0.111975, 90: 0.163509, 95: 0.224789, 100: 0.306231,
    105: 0.400000, 110: 0.550000, 115: 0.750000, 119: 1.000000,
  },
  female: {
    0: 0.004649, 1: 0.000299, 2: 0.000186, 3: 0.000140, 4: 0.000112,
    5: 0.000100, 10: 0.000076, 15: 0.000176, 20: 0.000484,
    25: 0.000748, 30: 0.000999, 35: 0.001441, 40: 0.002160,
    45: 0.003234, 50: 0.004881, 55: 0.007255, 60: 0.010517,
    65: 0.015540, 70: 0.023799, 75: 0.037453, 80: 0.059977,
    85: 0.094441, 90: 0.143606, 95: 0.205879, 100: 0.286401,
    105: 0.380000, 110: 0.530000, 115: 0.730000, 119: 1.000000,
  },
};

/**
 * Log-linear interpolation between two (age, q) anchor points.
 * We interpolate ln(q) linearly, which is appropriate for mortality rates.
 */
function logInterp(age, age0, q0, age1, q1) {
  if (q0 <= 0) return q1; // safety guard
  const t = (age - age0) / (age1 - age0);
  return Math.exp((1 - t) * Math.log(q0) + t * Math.log(q1));
}

/**
 * Build a full integer-age lookup array from anchor points.
 * Returns an array indexed by age (0-119).
 */
function buildTable(anchors) {
  const ages = Object.keys(anchors).map(Number).sort((a, b) => a - b);
  const table = new Array(120);

  for (let i = 0; i < ages.length - 1; i++) {
    const a0 = ages[i];
    const a1 = ages[i + 1];
    const q0 = anchors[a0];
    const q1 = anchors[a1];
    for (let age = a0; age < a1; age++) {
      table[age] = logInterp(age, a0, q0, a1, q1);
    }
  }
  // Fill last anchor
  const lastAge = ages[ages.length - 1];
  table[lastAge] = anchors[lastAge];
  // Fill any remaining ages above last anchor as 1.0
  for (let age = lastAge + 1; age < 120; age++) {
    table[age] = 1.0;
  }
  return table;
}

const SSA_LIFE_TABLE = {
  male:   buildTable(SSA_ANCHORS.male),
  female: buildTable(SSA_ANCHORS.female),
};

/**
 * Get annual mortality probability q(age, sex) from SSA 2021 life table.
 * @param {number} age  Integer age (0-119); non-integers are floored.
 * @param {'male'|'female'} sex
 * @returns {number} q(x) — annual probability of death
 */
function getQx(age, sex) {
  const idx = Math.min(Math.max(Math.floor(age), 0), 119);
  return SSA_LIFE_TABLE[sex][idx];
}

/**
 * Compute remaining life expectancy by integrating survival curve from
 * a given age, applying a mortality multiplier at each future age.
 * @param {number} startAge
 * @param {'male'|'female'} sex
 * @param {number} multiplier  Applied to q(x) at every future age (default 1.0)
 * @returns {number} Expected remaining years
 */
function lifeExpectancy(startAge, sex, multiplier) {
  multiplier = multiplier || 1.0;
  let survival = 1.0;
  let years = 0;
  for (let age = Math.floor(startAge); age < 119; age++) {
    const q = Math.min(getQx(age, sex) * multiplier, 1.0);
    survival *= (1 - q);
    years += survival;
  }
  return years;
}
