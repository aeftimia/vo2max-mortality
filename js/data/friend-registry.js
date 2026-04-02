/**
 * FRIEND Registry VO2 Max Percentile Norms
 * Source: Kaminsky LA et al. Mayo Clin Proc. 2015;90(11):1515-1523.
 * PMC: https://pmc.ncbi.nlm.nih.gov/articles/PMC4919021/
 * DOI: 10.1016/j.mayocp.2015.07.015
 *
 * Fitness Registry and the Importance of Exercise: A National Database (FRIEND).
 * Large US cohort of directly measured VO2 max values from clinical exercise
 * testing laboratories. Represents a relatively healthy US population.
 *
 * Values in mL/kg/min at given percentile thresholds.
 *
 * NOTE: This file is deprecated. The application now uses friend-2022-continuous.json
 * and the continuous FRIEND+Kokkinos model for both peer comparison and mortality calculations.
 */
const FRIEND_NORMS = {
  male: [
    // { ageMin, ageMax, p25, p50, p75, p90, p95 }
    { ageMin: 20, ageMax: 29, p5: 29.0, p25: 40.1, p50: 48.0, p75: 55.2, p90: 61.8, p95: 66.3 },
    { ageMin: 30, ageMax: 39, p5: 27.2, p25: 35.9, p50: 42.4, p75: 49.2, p90: 56.5, p95: 59.8 },
    { ageMin: 40, ageMax: 49, p5: 24.2, p25: 31.9, p50: 37.8, p75: 45.0, p90: 52.1, p95: 55.6 },
    { ageMin: 50, ageMax: 59, p5: 20.9, p25: 27.1, p50: 32.6, p75: 39.7, p90: 45.6, p95: 50.7 },
    { ageMin: 60, ageMax: 69, p5: 17.4, p25: 23.7, p50: 28.2, p75: 34.5, p90: 40.3, p95: 43.0 },
    { ageMin: 70, ageMax: 99, p5: 16.3, p25: 20.4, p50: 24.4, p75: 30.4, p90: 36.6, p95: 39.7 },
  ],
  female: [
    { ageMin: 20, ageMax: 29, p5: 21.7, p25: 30.5, p50: 37.6, p75: 44.7, p90: 51.3, p95: 56.0 },
    { ageMin: 30, ageMax: 39, p5: 19.0, p25: 25.3, p50: 30.2, p75: 36.1, p90: 41.4, p95: 45.8 },
    { ageMin: 40, ageMax: 49, p5: 17.0, p25: 22.1, p50: 26.7, p75: 32.4, p90: 38.4, p95: 41.7 },
    { ageMin: 50, ageMax: 59, p5: 16.0, p25: 19.9, p50: 23.4, p75: 27.6, p90: 32.0, p95: 35.9 },
    { ageMin: 60, ageMax: 69, p5: 13.4, p25: 17.2, p50: 20.0, p75: 23.8, p90: 27.0, p95: 29.4 },
    { ageMin: 70, ageMax: 99, p5: 13.1, p25: 15.6, p50: 18.3, p75: 20.8, p90: 23.1, p95: 24.1 },
  ],
};

/**
 * Estimate percentile rank for a given VO2 max, age, and sex using
 * piecewise linear interpolation between known percentile thresholds.
 * Returns a number between 0 and 100.
 *
 * @param {number} vo2max  mL/kg/min
 * @param {number} age
 * @param {'male'|'female'} sex
 * @returns {number} estimated percentile (0–100)
 */
function estimateFriendPercentile(vo2max, age, sex) {
  const rows = FRIEND_NORMS[sex];
  let row = rows[rows.length - 1];
  for (const r of rows) {
    if (age >= r.ageMin && age <= r.ageMax) { row = r; break; }
  }

  // Define breakpoints: [percentile, vo2max_value]
  const pts = [
    [0,   0],
    [5,   row.p5],
    [25,  row.p25],
    [50,  row.p50],
    [75,  row.p75],
    [90,  row.p90],
    [95,  row.p95],
    [100, row.p95 * 1.25],  // rough extrapolation beyond 95th
  ];

  // Find the bracket
  for (let i = 0; i < pts.length - 1; i++) {
    const [p0, v0] = pts[i];
    const [p1, v1] = pts[i + 1];
    if (vo2max >= v0 && vo2max <= v1) {
      return p0 + (vo2max - v0) / (v1 - v0) * (p1 - p0);
    }
  }
  if (vo2max < pts[0][1]) return 0;
  return 99;
}
