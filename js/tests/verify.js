/**
 * Verification / unit tests for the mortality engine.
 * Load this file only when ?debug=1 is in the URL.
 *
 * Run in the browser console after page load:
 *   Verify.run()
 */
const Verify = {
  pass: 0,
  fail: 0,

  assert(label, condition) {
    if (condition) {
      console.log(`  ✓ ${label}`);
      this.pass++;
    } else {
      console.error(`  ✗ FAIL: ${label}`);
      this.fail++;
    }
  },

  assertClose(label, actual, expected, tol) {
    tol = tol || 0.02;
    const rel = Math.abs(actual - expected) / (Math.abs(expected) || 1);
    this.assert(`${label}: ${actual.toFixed(6)} ≈ ${expected.toFixed(6)} (±${(tol*100).toFixed(0)}%)`,
                rel <= tol);
  },

  run() {
    this.pass = 0;
    this.fail = 0;
    console.group('VO2 Max Mortality Calculator — Verification Suite');

    // ── Test 1: Population-weighted HR ────────────────────────────────────
    console.group('1. Population-weighted HR (W)');
    this.assertClose('W ≈ 0.601', MANDSAGER_W, 0.601, 0.05);
    console.groupEnd();

    // ── Test 2: Sanity check q ordering ───────────────────────────────────
    console.group('2. q ordering: q_Low > q_pop > q_Elite (40yo male)');
    const r40 = computeMortality({ age: 40, sex: 'male', vo2max: 20, riskFactors: [] });
    this.assert('q_Low > q_pop', r40.qLow > r40.qPop);
    this.assert('q_Elite < q_pop', r40.qByCategory.Elite < r40.qPop);
    this.assert('q_Elite < q_High < q_AboveAvg < q_BelowAvg < q_Low',
      r40.qByCategory.Elite < r40.qByCategory.High &&
      r40.qByCategory.High < r40.qByCategory.AboveAvg &&
      r40.qByCategory.AboveAvg < r40.qByCategory.BelowAvg &&
      r40.qByCategory.BelowAvg < r40.qByCategory.Low);
    console.groupEnd();

    // ── Test 3: HR ratios preserved ───────────────────────────────────────
    console.group('3. HR ratios preserved in q_category');
    const r = computeMortality({ age: 50, sex: 'male', vo2max: 30, riskFactors: [] });
    this.assertClose('q_Elite / q_Low ≈ 0.20', r.qByCategory.Elite / r.qByCategory.Low, 0.20, 0.02);
    this.assertClose('q_BelowAvg / q_Low ≈ 0.71', r.qByCategory.BelowAvg / r.qByCategory.Low, 0.71, 0.02);
    this.assertClose('q_AboveAvg / q_Low ≈ 0.50', r.qByCategory.AboveAvg / r.qByCategory.Low, 0.50, 0.02);
    this.assertClose('q_High / q_Low ≈ 0.39', r.qByCategory.High / r.qByCategory.Low, 0.39, 0.02);
    console.groupEnd();

    // ── Test 4: 30yo male, VO2 45 → AboveAvg, ~0.12-0.13%/yr ─────────────
    console.group('4. Reference case: 30yo male, VO2 45');
    const r30 = computeMortality({ age: 30, sex: 'male', vo2max: 45, riskFactors: [] });
    this.assert('classified as AboveAvg', r30.currentCategory === 'AboveAvg');
    this.assertClose('q_user ≈ 0.0013 (0.13%/yr)', r30.qUser, 0.0013, 0.20);
    console.groupEnd();

    // ── Test 5: Risk factors multiply correctly ────────────────────────────
    console.group('5. Risk factor application');
    const rDiab = computeMortality({ age: 30, sex: 'male', vo2max: 45, riskFactors: ['diabetes'] });
    this.assertClose('diabetes HR applied: q_user ratio ≈ 1.93',
      rDiab.qUser / r30.qUser, 1.93, 0.01);
    console.groupEnd();

    // ── Test 6: deltaQ = 0 for current category ───────────────────────────
    console.group('6. deltaQ[currentCategory] === 0');
    this.assert('deltaQ at current = 0',
      Math.abs(r30.deltaQ[r30.currentCategory]) < 1e-12);
    console.groupEnd();

    // ── Test 7: Life table values plausible ───────────────────────────────
    console.group('7. SSA life table plausibility');
    this.assert('q(40,male) > q(30,male)', getQx(40,'male') > getQx(30,'male'));
    this.assert('q(70,male) > q(50,male)', getQx(70,'male') > getQx(50,'male'));
    this.assert('q(70,female) < q(70,male)', getQx(70,'female') < getQx(70,'male'));
    this.assertClose('q(40,male) near 0.003', getQx(40,'male'), 0.003, 0.30);
    console.groupEnd();

    // ── Summary ───────────────────────────────────────────────────────────
    console.groupEnd();
    console.log(`\nResults: ${this.pass} passed, ${this.fail} failed.`);
    if (this.fail === 0) console.log('✓ All tests passed!');
    else console.error(`✗ ${this.fail} test(s) failed — check engine.js and data files.`);
  },
};

// Auto-run if ?debug=1 in URL
if (new URLSearchParams(window.location.search).get('debug') === '1') {
  window.addEventListener('load', () => {
    setTimeout(() => Verify.run(), 500);
  });
}
