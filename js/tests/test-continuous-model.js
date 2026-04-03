/**
 * Test Suite: Continuous VO2 Model
 * 
 * Validates the FRIEND 2022 continuous fitness model implementation.
 * Tests:
 *  1. Data loading and initialization
 *  2. Spline monotonicity and smoothness
 *  3. Normalization constant behavior
 *  4. Continuous hazard ratio computation
 *  5. Percentile lookup accuracy
 *  6. Population-average normalization
 *  7. Sanity checks on output values
 */

function testContinuousModel() {
  console.log('\n' + '='.repeat(70));
  console.log('TEST SUITE: Continuous VO2 Model (FRIEND 2022 + Kokkinos 2022)');
  console.log('='.repeat(70));
  
  let passed = 0;
  let failed = 0;
  
  // ── Test 1: Data loaded ──────────────────────────────────────────────────
  console.log('\n[1] Data loading...');
  try {
    if (!FRIEND_2022_CONTINUOUS || !FRIEND_2022_CONTINUOUS.metadata) {
      throw new Error('FRIEND_2022_CONTINUOUS not loaded');
    }
    if (!FRIEND_2022_CONTINUOUS.normalization ||
        !FRIEND_2022_CONTINUOUS.percentile_splines) {
      throw new Error('Missing normalization or percentile_splines data');
    }
    console.log('  ✓ Data loaded successfully');
    console.log(`    Model: ${FRIEND_2022_CONTINUOUS.metadata.model}`);
    console.log(`    Source: ${FRIEND_2022_CONTINUOUS.metadata.source}`);
    passed++;
  } catch (e) {
    console.error(`  ✗ ${e.message}`);
    failed++;
  }
  
  // ── Test 2: Normalization constants ──────────────────────────────────────
  console.log('\n[2] Normalization constants...');
  try {
    const k_male = getNormalizationConstant(50, 'male');
    const k_female = getNormalizationConstant(50, 'female');
    
    if (typeof k_male !== 'number' || k_male <= 0 || k_male > 100) {
      throw new Error(`Invalid k_male = ${k_male}`);
    }
    if (typeof k_female !== 'number' || k_female <= 0 || k_female > 100) {
      throw new Error(`Invalid k_female = ${k_female}`);
    }
    
    // Females typically have higher k (higher average fitness HR due to lower VO2 norms)
    console.log(`  ✓ k(50, male) = ${k_male.toFixed(4)}`);
    console.log(`  ✓ k(50, female) = ${k_female.toFixed(4)}`);
    passed++;
  } catch (e) {
    console.error(`  ✗ ${e.message}`);
    failed++;
  }
  
  // ── Test 3: VO2 lookup monotonicity ──────────────────────────────────────
  console.log('\n[3] VO2 lookup monotonicity...');
  try {
    let issues = [];
    
    for (const sex of ['male', 'female']) {
      // At fixed percentile, VO2 should decrease with age
      const percentiles = [10, 50, 90];
      for (const p of percentiles) {
        let prev_vo2 = Infinity;
        for (let age = 20; age <= 85; age += 5) {
          const vo2 = getVo2FromPercentile(age, p, sex);
          if (vo2 > prev_vo2 + 0.1) {  // allow small numerical tolerance
            issues.push(`${sex} p${p}: VO2 increased age ${age-5}→${age} (${prev_vo2.toFixed(1)}→${vo2.toFixed(1)})`);
          }
          prev_vo2 = vo2;
        }
      }
    }
    
    if (issues.length === 0) {
      console.log('  ✓ VO2 decreases monotonically with age at all percentiles');
      passed++;
    } else {
      console.error(`  ✗ Monotonicity violations: ${issues.join('; ')}`);
      failed++;
    }
  } catch (e) {
    console.error(`  ✗ ${e.message}`);
    failed++;
  }
  
  // ── Test 4: Percentile lookup monotonicity ──────────────────────────────
  console.log('\n[4] Percentile lookup (VO2→percentile) monotonicity...');
  try {
    let issues = [];
    
    for (const sex of ['male', 'female']) {
      for (let age = 25; age <= 80; age += 10) {
        let prev_p = 0;
        for (const vo2 of [10, 20, 30, 40, 50, 60]) {
          const p = getPercentileFromVo2(age, vo2, sex);
          if (p !== null && p < prev_p - 0.1) {
            issues.push(`${sex} age ${age}: percentile decreased VO2 ${vo2} (${p.toFixed(0)})`);
          }
          prev_p = p !== null ? p : prev_p;
        }
      }
    }
    
    if (issues.length === 0) {
      console.log('  ✓ Percentiles increase monotonically with VO2');
      passed++;
    } else {
      console.error(`  ✗ Monotonicity violations: ${issues.join('; ')}`);
      failed++;
    }
  } catch (e) {
    console.error(`  ✗ ${e.message}`);
    failed++;
  }
  
  // ── Test 5: Hazard ratio sanity ──────────────────────────────────────────
  console.log('\n[5] Fitness hazard ratio sanity checks...');
  try {
    const testCases = [
      {age: 40, sex: 'male', vo2: 30, desc: '40yo male, VO2=30'},
      {age: 40, sex: 'male', vo2: 50, desc: '40yo male, VO2=50'},
      {age: 60, sex: 'female', vo2: 25, desc: '60yo female, VO2=25'},
      {age: 60, sex: 'female', vo2: 40, desc: '60yo female, VO2=40'},
    ];
    
    let issues = [];
    for (const {age, sex, vo2, desc} of testCases) {
      const hr_low = getNormalizedFitnessHR(age, vo2 - 5, sex);
      const hr_high = getNormalizedFitnessHR(age, vo2 + 5, sex);
      
      // Higher VO2 should give lower HR (better fitness)
      if (hr_high >= hr_low - 0.001) {
        issues.push(`${desc}: HR not decreasing with VO2 (${hr_low.toFixed(3)}→${hr_high.toFixed(3)})`);
      }
      
      // HR should be in reasonable range (0.1 - 10)
      if (hr_low < 0.1 || hr_low > 10 || hr_high < 0.1 || hr_high > 10) {
        issues.push(`${desc}: HR out of reasonable range`);
      }
    }
    
    if (issues.length === 0) {
      console.log('  ✓ Hazard ratios decrease with VO2 (better fitness → lower mortality)');
      console.log('  ✓ All hazard ratios in reasonable range (0.1–10)');
      passed++;
    } else {
      console.error(`  ✗ Issues: ${issues.join('; ')}`);
      failed++;
    }
  } catch (e) {
    console.error(`  ✗ ${e.message}`);
    failed++;
  }
  
  // ── Test 6: Population-average normalization ────────────────────────────
  console.log('\n[6] Population-average HR normalization...');
  try {
    // Check that average HR across a range of VO2 values is close to 1.0
    // (This is approximate due to discretization, but should be in range 0.95-1.05)
    
    let issues = [];
    for (const sex of ['male', 'female']) {
      for (const age of [30, 50, 70]) {
        // Sample HR at many percentiles and average
        let hr_sum = 0;
        const n = 20;
        for (let i = 0; i < n; i++) {
          const percentile = (i + 0.5) * (100 / n);  // uniform sampling
          const vo2 = getVo2FromPercentile(age, percentile, sex);
          const hr = getNormalizedFitnessHR(age, vo2, sex);
          hr_sum += hr;
        }
        const avg_hr = hr_sum / n;
        
        // Should be close to 1.0
        if (avg_hr < 0.95 || avg_hr > 1.05) {
          issues.push(`${sex} age ${age}: avg HR = ${avg_hr.toFixed(3)} (should be ~1.0)`);
        }
      }
    }
    
    if (issues.length === 0) {
      console.log('  ✓ Population-averaged HR ≈ 1.0 across all age/sex groups');
      passed++;
    } else {
      console.error(`  ✗ Normalization issues: ${issues.join('; ')}`);
      failed++;
    }
  } catch (e) {
    console.error(`  ✗ ${e.message}`);
    failed++;
  }
  
  // ── Test 7: Inverse function consistency ────────────────────────────────
  console.log('\n[7] Inverse function consistency (VO2→percentile→VO2)...');
  try {
    let issues = [];
    
    for (const sex of ['male', 'female']) {
      for (let age = 25; age <= 75; age += 10) {
        // Sample VO2 values across the range
        for (const target_percentile of [20, 50, 80]) {
          const vo2_orig = getVo2FromPercentile(age, target_percentile, sex);
          const p_computed = getPercentileFromVo2(age, vo2_orig, sex);
          
          if (p_computed === null) {
            issues.push(`${sex} age ${age}, p${target_percentile}: returned null`);
            continue;
          }
          
          const error = Math.abs(p_computed - target_percentile);
          if (error > 1.0) {  // 1 percentile point tolerance
            issues.push(`${sex} age ${age}, p${target_percentile}: round-trip error ${error.toFixed(1)}%`);
          }
        }
      }
    }
    
    if (issues.length === 0) {
      console.log('  ✓ Round-trip conversion VO2→percentile→VO2 is consistent');
      passed++;
    } else {
      console.error(`  ✗ Conversion issues: ${issues.join('; ')}`);
      failed++;
    }
  } catch (e) {
    console.error(`  ✗ ${e.message}`);
    failed++;
  }
  
  // ── Test 8: Integration with computeMortality ────────────────────────────
  console.log('\n[8] Integration with computeMortality()...');
  try {
    const result = computeMortality({
      age: 45,
      sex: 'male',
      vo2max: 42,
      riskFactors: []
    });
    
    let issues = [];
    
    if (!result.fitnessHR) issues.push('fitnessHR missing');
    if (result.fitnessHR <= 0 || result.fitnessHR > 10) issues.push(`fitnessHR out of range: ${result.fitnessHR}`);
    if (!result.qUser) issues.push('qUser missing');
    if (result.qUser <= 0) issues.push(`qUser non-positive: ${result.qUser}`);
    if (!result.friendPercentile) issues.push('friendPercentile missing');
    
    if (issues.length === 0) {
      console.log(`  ✓ computeMortality() returns expected fields`);
      console.log(`    Age 45 male, VO2 42: fitnessHR=${result.fitnessHR.toFixed(3)}, qUser=${(result.qUser*100).toFixed(3)}%`);
      passed++;
    } else {
      console.error(`  ✗ Missing or invalid fields: ${issues.join(', ')}`);
      failed++;
    }
  } catch (e) {
    console.error(`  ✗ ${e.message}`);
    failed++;
  }
  
  // ── Test 9: Edge cases ──────────────────────────────────────────────────
  console.log('\n[9] Edge cases...');
  try {
    let issues = [];
    
    // Very young age
    const hr_young = getNormalizedFitnessHR(20, 45, 'male');
    if (!isFinite(hr_young)) issues.push('Age 20: non-finite HR');
    
    // Very old age
    const hr_old = getNormalizedFitnessHR(89, 20, 'female');
    if (!isFinite(hr_old)) issues.push('Age 89: non-finite HR');
    
    // Extreme VO2 values
    const hr_low_vo2 = getNormalizedFitnessHR(50, 10, 'male');
    const hr_high_vo2 = getNormalizedFitnessHR(50, 60, 'male');
    if (hr_high_vo2 >= hr_low_vo2) issues.push('VO2 10 vs 60: monotonicity violated');
    
    // Percentile bounds
    const vo2_p0 = getVo2FromPercentile(40, 0, 'male');
    const vo2_p100 = getVo2FromPercentile(40, 100, 'male');
    const vo2_p50 = getVo2FromPercentile(40, 50, 'male');
    if (vo2_p0 > vo2_p50 + 0.1 || vo2_p100 < vo2_p50 - 0.1) {
      issues.push('Percentile bounds inconsistent');
    }
    
    if (issues.length === 0) {
      console.log('  ✓ All edge cases handled correctly');
      passed++;
    } else {
      console.error(`  ✗ Edge case issues: ${issues.join('; ')}`);
      failed++;
    }
  } catch (e) {
    console.error(`  ✗ ${e.message}`);
    failed++;
  }
  
  // ── Summary ──────────────────────────────────────────────────────────────
  console.log('\n' + '='.repeat(70));
  console.log(`RESULTS: ${passed} passed, ${failed} failed`);
  console.log('='.repeat(70) + '\n');
  
  return failed === 0;
}

/**
 * Test Suite: Grip Strength Model
 */
function testGripModel() {
  console.log('\n' + '='.repeat(70));
  console.log('TEST SUITE: Grip Strength Model (Lookup 7+ / Celis-Morales 2018)');
  console.log('='.repeat(70));

  let passed = 0;
  let failed = 0;

  // ── Test 1: Data loaded ──────────────────────────────────────────────────
  console.log('\n[1] Data loading...');
  try {
    if (!GRIP_STRENGTH_DATA || !GRIP_STRENGTH_DATA.metadata) {
      throw new Error('GRIP_STRENGTH_DATA not loaded');
    }
    if (!GRIP_STRENGTH_DATA.normalization ||
        !GRIP_STRENGTH_DATA.percentile_splines) {
      throw new Error('Missing normalization or percentile_splines data');
    }
    console.log('  \u2713 Data loaded successfully');
    console.log(`    Model: ${GRIP_STRENGTH_DATA.metadata.model}`);
    passed++;
  } catch (e) {
    console.error(`  \u2717 ${e.message}`);
    failed++;
  }

  // ── Test 2: Sex-stratified HR constants ────────────────────────────────
  console.log('\n[2] Sex-stratified HR constants...');
  try {
    const c = GRIP_STRENGTH_DATA.metadata.constants;
    if (typeof c.HR_per_unit.male !== 'number' || typeof c.HR_per_unit.female !== 'number') {
      throw new Error('HR_per_unit not sex-stratified');
    }
    // Female HR should be more protective per unit (lower value) since 1.20 > 1.16
    if (c.HR_per_unit.female >= c.HR_per_unit.male) {
      throw new Error(`Expected female HR_per_unit < male, got ${c.HR_per_unit.female} vs ${c.HR_per_unit.male}`);
    }
    console.log(`  \u2713 HR_per_unit: male=${c.HR_per_unit.male.toFixed(6)}, female=${c.HR_per_unit.female.toFixed(6)}`);
    passed++;
  } catch (e) {
    console.error(`  \u2717 ${e.message}`);
    failed++;
  }

  // ── Test 3: Grip lookup monotonicity ────────────────────────────────────
  console.log('\n[3] Grip lookup monotonicity...');
  try {
    let issues = [];
    for (const sex of ['male', 'female']) {
      // At fixed percentile, grip should generally decrease with age (after ~40)
      for (const p of [5, 50, 95]) {
        let prev_grip = Infinity;
        for (let age = 50; age <= 85; age += 5) {
          const grip = getMetricFromPercentile(age, p, sex, 'grip');
          if (grip > prev_grip + 0.5) {
            issues.push(`${sex} p${p}: grip increased age ${age-5}\u2192${age} (${prev_grip.toFixed(1)}\u2192${grip.toFixed(1)})`);
          }
          prev_grip = grip;
        }
      }
    }
    if (issues.length === 0) {
      console.log('  \u2713 Grip decreases monotonically with age (after 50) at tested percentiles');
      passed++;
    } else {
      console.error(`  \u2717 Monotonicity violations: ${issues.join('; ')}`);
      failed++;
    }
  } catch (e) {
    console.error(`  \u2717 ${e.message}`);
    failed++;
  }

  // ── Test 4: HR sanity ──────────────────────────────────────────────────
  console.log('\n[4] Grip hazard ratio sanity checks...');
  try {
    let issues = [];
    for (const sex of ['male', 'female']) {
      const hr_low = getNormalizedFitnessHR(50, 20, sex, 'central', 'grip');
      const hr_high = getNormalizedFitnessHR(50, 40, sex, 'central', 'grip');
      if (hr_high >= hr_low - 0.001) {
        issues.push(`${sex}: HR not decreasing with grip (${hr_low.toFixed(3)}\u2192${hr_high.toFixed(3)})`);
      }
      if (hr_low < 0.1 || hr_low > 10 || hr_high < 0.1 || hr_high > 10) {
        issues.push(`${sex}: HR out of range`);
      }
    }
    if (issues.length === 0) {
      console.log('  \u2713 Stronger grip \u2192 lower HR (both sexes)');
      passed++;
    } else {
      console.error(`  \u2717 ${issues.join('; ')}`);
      failed++;
    }
  } catch (e) {
    console.error(`  \u2717 ${e.message}`);
    failed++;
  }

  // ── Test 5: Population-average normalization ────────────────────────────
  console.log('\n[5] Population-average HR normalization...');
  try {
    let issues = [];
    for (const sex of ['male', 'female']) {
      for (const age of [30, 50, 70]) {
        let hr_sum = 0;
        const n = 20;
        for (let i = 0; i < n; i++) {
          const percentile = (i + 0.5) * (100 / n);
          const grip = getMetricFromPercentile(age, percentile, sex, 'grip');
          const hr = getNormalizedFitnessHR(age, grip, sex, 'central', 'grip');
          hr_sum += hr;
        }
        const avg_hr = hr_sum / n;
        if (avg_hr < 0.95 || avg_hr > 1.05) {
          issues.push(`${sex} age ${age}: avg HR = ${avg_hr.toFixed(3)}`);
        }
      }
    }
    if (issues.length === 0) {
      console.log('  \u2713 Population-averaged HR \u2248 1.0 for grip across all age/sex groups');
      passed++;
    } else {
      console.error(`  \u2717 ${issues.join('; ')}`);
      failed++;
    }
  } catch (e) {
    console.error(`  \u2717 ${e.message}`);
    failed++;
  }

  // ── Test 6: computeMortality with grip ──────────────────────────────────
  console.log('\n[6] computeMortality() with grip...');
  try {
    const result = computeMortality({
      age: 50,
      sex: 'male',
      metricValue: 40,
      metric: 'grip',
      riskFactors: []
    });
    let issues = [];
    if (!result.fitnessHR) issues.push('fitnessHR missing');
    if (result.metric !== 'grip') issues.push(`metric should be 'grip', got '${result.metric}'`);
    if (!result.metricUnit) issues.push('metricUnit missing');
    if (result.qUser <= 0) issues.push(`qUser non-positive: ${result.qUser}`);
    if (issues.length === 0) {
      console.log(`  \u2713 computeMortality() works for grip`);
      console.log(`    Age 50 male, grip 40 kg: fitnessHR=${result.fitnessHR.toFixed(3)}, qUser=${(result.qUser*100).toFixed(3)}%`);
      passed++;
    } else {
      console.error(`  \u2717 ${issues.join(', ')}`);
      failed++;
    }
  } catch (e) {
    console.error(`  \u2717 ${e.message}`);
    failed++;
  }

  // ── Summary ──────────────────────────────────────────────────────────────
  console.log('\n' + '='.repeat(70));
  console.log(`RESULTS: ${passed} passed, ${failed} failed`);
  console.log('='.repeat(70) + '\n');

  return failed === 0;
}

// Export for use in automated tests
window.testContinuousModel = testContinuousModel;
window.testGripModel = testGripModel;
