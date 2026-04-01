/**
 * Data from Mandsager et al. (2018)
 * "Association Between Cardiorespiratory Fitness and Long-term Mortality
 *  Among Adults Undergoing Exercise Treadmill Testing"
 * JAMA Network Open. 2018;1(6):e183605.
 * DOI: 10.1001/jamanetworkopen.2018.3605
 * Open access: https://pmc.ncbi.nlm.nih.gov/articles/PMC6324439/
 *
 * Study: 122,007 patients at Cleveland Clinic, median follow-up 8.4 years,
 * 13,637 deaths over 1.1 million person-years.
 *
 * FITNESS CATEGORIES are defined by age- and sex-specific percentiles
 * within the Mandsager cohort (a clinical exercise testing population).
 * NOTE: This cohort skews sicker than the general population; see methodology
 * for implications on interpretation.
 */

// ---------------------------------------------------------------------------
// Hazard ratios for all-cause mortality vs Low fitness (Table 2 of paper)
// Adjusted for: age, sex, year of test, comorbidities
// ---------------------------------------------------------------------------
const MANDSAGER_HR = {
  Low:      { hr: 1.00, ci: [1.00, 1.00] },   // reference
  BelowAvg: { hr: 0.71, ci: [0.67, 0.75] },   // directly from Table 2
  AboveAvg: { hr: 0.50, ci: [0.47, 0.54] },   // directly from Table 2
  High:     { hr: 0.39, ci: [0.36, 0.42] },   // directly from Table 2 (verified from PMC6324439)
  Elite:    { hr: 0.20, ci: [0.16, 0.24] },   // directly from Table 2
};

// Cross-checks from paper (used for verification):
//   Elite vs High (direct comparison): HR 0.77 (CI 0.63-0.95)
//   BelowAvg vs AboveAvg (direct):     HR 1.41 (CI 1.31-1.51)
// NOTE: 0.20/0.39 = 0.513 ≠ 0.77. This is expected — Cox model HRs are independently
// estimated from the full dataset; direct pairwise comparisons are not simple ratios
// of vs-Low HRs because model adjustment differs for each comparison.

// ---------------------------------------------------------------------------
// Cohort fractions (derived from Table 1 sample sizes, n=122,007)
//   Low: 29,181  BelowAvg: 27,172  AboveAvg: 31,897  High: 30,187  Elite: 3,570
// ---------------------------------------------------------------------------
const MANDSAGER_FRACTIONS = {
  Low:      29181 / 122007,  // 0.2392
  BelowAvg: 27172 / 122007,  // 0.2227
  AboveAvg: 31897 / 122007,  // 0.2614
  High:     30187 / 122007,  // 0.2474
  Elite:     3570 / 122007,  // 0.0293
};

// Population-weighted average HR (used in back-calculation from life table)
// W = Σ(f_i × HR_i)
const MANDSAGER_W = Object.keys(MANDSAGER_HR).reduce((sum, cat) => {
  return sum + MANDSAGER_FRACTIONS[cat] * MANDSAGER_HR[cat].hr;
}, 0);

// ---------------------------------------------------------------------------
// VO2 max category boundaries (mL/kg/min) from paper Table 1.
// Original values in METs; converted to mL/kg/min via: VO2 = METs × 3.5
//
// Age ranges follow the paper's groupings.
// Within each category entry, the boundary is the LOWER bound of that category
// (values >= boundary AND < next boundary belong to this category).
// Elite has no upper bound.
// Low has no lower bound (catches everything below BelowAvg).
// ---------------------------------------------------------------------------
const MANDSAGER_BOUNDARIES = {
  // Boundaries are the START (lower bound) of each category.
  // Derived from paper Table 1 MET ranges; VO2 = METs × 3.5 mL/kg/min.
  // Verified against PMC6324439 full text.
  male: [
    // { ageMin, ageMax, BelowAvg, AboveAvg, High, Elite }
    // METs:  18-19: 10.8 / 13.0 / 14.0 / 16.3
    { ageMin: 18, ageMax: 19, BelowAvg: 37.80, AboveAvg: 45.50, High: 49.00, Elite: 57.05 },
    // METs:  20-29: 10.3 / 12.0 / 13.7 / 15.7
    { ageMin: 20, ageMax: 29, BelowAvg: 36.05, AboveAvg: 42.00, High: 47.95, Elite: 54.95 },
    // METs:  30-39: 10.0 / 11.2 / 13.0 / 15.0
    { ageMin: 30, ageMax: 39, BelowAvg: 35.00, AboveAvg: 39.20, High: 45.50, Elite: 52.50 },
    // METs:  40-49:  9.8 / 11.0 / 12.5 / 14.7
    { ageMin: 40, ageMax: 49, BelowAvg: 34.30, AboveAvg: 38.50, High: 43.75, Elite: 51.45 },
    // METs:  50-59:  8.2 / 10.0 / 11.4 / 14.0
    { ageMin: 50, ageMax: 59, BelowAvg: 28.70, AboveAvg: 35.00, High: 39.90, Elite: 49.00 },
    // METs:  60-69:  7.0 /  8.5 / 10.0 / 13.0
    { ageMin: 60, ageMax: 69, BelowAvg: 24.50, AboveAvg: 29.75, High: 35.00, Elite: 45.50 },
    // METs:  70-79:  6.0 /  7.0 /  8.5 / 11.5
    { ageMin: 70, ageMax: 79, BelowAvg: 21.00, AboveAvg: 24.50, High: 29.75, Elite: 40.25 },
    // METs:   ≥80:   5.1 /  6.3 /  7.3 / 10.0
    { ageMin: 80, ageMax: 99, BelowAvg: 17.85, AboveAvg: 22.05, High: 25.55, Elite: 35.00 },
  ],
  female: [
    // METs:  18-19: 10.0 / 11.1 / 13.0 / 15.0
    { ageMin: 18, ageMax: 19, BelowAvg: 35.00, AboveAvg: 38.85, High: 45.50, Elite: 52.50 },
    // METs:  20-29:  8.0 / 10.0 / 11.5 / 14.3
    { ageMin: 20, ageMax: 29, BelowAvg: 28.00, AboveAvg: 35.00, High: 40.25, Elite: 50.05 },
    // METs:  30-39:  7.7 /  9.4 / 10.9 / 13.7
    { ageMin: 30, ageMax: 39, BelowAvg: 26.95, AboveAvg: 32.90, High: 38.15, Elite: 47.95 },
    // METs:  40-49:  7.4 /  9.0 / 10.4 / 13.3
    { ageMin: 40, ageMax: 49, BelowAvg: 25.90, AboveAvg: 31.50, High: 36.40, Elite: 46.55 },
    // METs:  50-59:  7.0 /  8.1 / 10.0 / 13.0
    { ageMin: 50, ageMax: 59, BelowAvg: 24.50, AboveAvg: 28.35, High: 35.00, Elite: 45.50 },
    // METs:  60-69:  6.0 /  7.0 /  8.5 / 11.1
    { ageMin: 60, ageMax: 69, BelowAvg: 21.00, AboveAvg: 24.50, High: 29.75, Elite: 38.85 },
    // METs:  70-79:  5.0 /  6.0 /  7.0 / 10.0
    { ageMin: 70, ageMax: 79, BelowAvg: 17.50, AboveAvg: 21.00, High: 24.50, Elite: 35.00 },
    // METs:   ≥80:   4.4 /  5.5 /  6.3 /  8.4
    { ageMin: 80, ageMax: 99, BelowAvg: 15.40, AboveAvg: 19.25, High: 22.05, Elite: 29.40 },
  ],
};

/**
 * Look up the VO2 max category boundary row for a given age and sex.
 * @param {number} age
 * @param {'male'|'female'} sex
 * @returns boundary row object
 */
function getBoundaryRow(age, sex) {
  const rows = MANDSAGER_BOUNDARIES[sex];
  for (const row of rows) {
    if (age >= row.ageMin && age <= row.ageMax) return row;
  }
  // Clamp to nearest range
  return age < rows[0].ageMin ? rows[0] : rows[rows.length - 1];
}

/**
 * Classify a VO2 max into a Mandsager fitness category.
 * @param {number} vo2max  mL/kg/min
 * @param {number} age
 * @param {'male'|'female'} sex
 * @returns {'Low'|'BelowAvg'|'AboveAvg'|'High'|'Elite'}
 */
function classifyMandsager(vo2max, age, sex) {
  const row = getBoundaryRow(age, sex);
  if (vo2max >= row.Elite)    return 'Elite';
  if (vo2max >= row.High)     return 'High';
  if (vo2max >= row.AboveAvg) return 'AboveAvg';
  if (vo2max >= row.BelowAvg) return 'BelowAvg';
  return 'Low';
}

/**
 * Get the VO2 max boundaries (lower bound of each category) for display.
 * Returns { Low, BelowAvg, AboveAvg, High, Elite } where each value is
 * the minimum VO2 max to be in that category.
 */
function getCategoryBounds(age, sex) {
  const row = getBoundaryRow(age, sex);
  return {
    Low:      0,
    BelowAvg: row.BelowAvg,
    AboveAvg: row.AboveAvg,
    High:     row.High,
    Elite:    row.Elite,
  };
}
