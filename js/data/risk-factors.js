/**
 * Risk Factor Hazard Ratios for All-Cause Mortality
 *
 * Each entry is a multiplicative adjustment applied to the baseline annual
 * mortality probability. The model multiplies all selected risk factor HRs
 * together (independence assumption — see methodology for limitations).
 *
 * HRs represent population-level estimates. Individual variation is large.
 * Sources are large prospective cohort studies or meta-analyses.
 */
const RISK_FACTORS = [
  {
    id: 'diabetes',
    label: 'Type 2 diabetes',
    hr: 1.93,
    ci: [1.80, 2.08],
    source: 'Seshasai SR et al. N Engl J Med. 2011;364(9):829-841. ' +
            'Meta-analysis of 97 prospective studies, 820,900 individuals.',
    notes: 'Versus no diabetes. Effect may be partially attenuated with well-controlled HbA1c.',
  },
  {
    id: 'hypertension',
    label: 'Hypertension (high blood pressure)',
    hr: 1.20,
    ci: [1.15, 1.25],
    source: 'Prospective Studies Collaboration. Lancet. 2002;360(9349):1903-1913. ' +
            'Meta-analysis of 61 prospective studies.',
    notes: 'Diagnosed hypertension vs normotensive. Effect attenuated in well-treated populations.',
  },
  {
    id: 'smoking_current',
    label: 'Current smoker',
    hr: 1.83,
    ci: [1.74, 1.93],
    source: 'Jha P et al. N Engl J Med. 2013;368(4):341-350. ' +
            'US Cancer Prevention Study-II cohort.',
    notes: 'Current smokers vs never-smokers, all-cause mortality.',
  },
  {
    id: 'smoking_former',
    label: 'Former smoker (quit)',
    hr: 1.34,
    ci: [1.27, 1.42],
    source: 'Jha P et al. N Engl J Med. 2013;368(4):341-350.',
    notes: 'Former smokers who quit ≥10 years vs never-smokers.',
  },
  {
    id: 'obesity_1',
    label: 'Obesity class I (BMI 30–35)',
    hr: 1.12,
    ci: [1.06, 1.18],
    source: 'Berrington de Gonzalez A et al. N Engl J Med. 2010;363(23):2211-2219. ' +
            'Pooled analysis of 19 prospective studies, 1.46 million adults.',
    notes: 'BMI 30–34.9 vs BMI 22.5–24.9, never-smokers.',
  },
  {
    id: 'obesity_2',
    label: 'Obesity class II (BMI 35–40)',
    hr: 1.27,
    ci: [1.17, 1.38],
    source: 'Berrington de Gonzalez A et al. N Engl J Med. 2010;363(23):2211-2219.',
    notes: 'BMI 35–39.9 vs BMI 22.5–24.9, never-smokers.',
  },
  {
    id: 'obesity_3',
    label: 'Obesity class III (BMI ≥ 40)',
    hr: 1.55,
    ci: [1.38, 1.73],
    source: 'Berrington de Gonzalez A et al. N Engl J Med. 2010;363(23):2211-2219.',
    notes: 'BMI ≥40 vs BMI 22.5–24.9, never-smokers.',
  },
  {
    id: 'cad',
    label: 'Coronary artery disease or prior heart attack',
    hr: 2.45,
    ci: [1.98, 3.02],
    source: 'Sulo G et al. Eur J Prev Cardiol. 2020;27(18):1954-1963. ' +
            'Norwegian Myocardial Infarction Registry.',
    notes: 'Post-MI all-cause mortality vs age-matched general population.',
  },
  {
    id: 'copd_moderate',
    label: 'COPD (moderate — GOLD stage II)',
    hr: 1.62,
    ci: [1.45, 1.81],
    source: 'Mannino DM et al. Thorax. 2006;61(2):115-120. ' +
            'NHANES I Epidemiologic Follow-up Study.',
    notes: 'GOLD stage II (FEV1 50–79% predicted) vs normal spirometry.',
  },
  {
    id: 'copd_severe',
    label: 'COPD (severe — GOLD stage III–IV)',
    hr: 2.16,
    ci: [1.79, 2.60],
    source: 'Mannino DM et al. Thorax. 2006;61(2):115-120.',
    notes: 'GOLD stage III–IV (FEV1 <50% predicted) vs normal spirometry.',
  },
  {
    id: 'ckd_3a',
    label: 'Chronic kidney disease stage 3A (eGFR 45–59)',
    hr: 1.35,
    ci: [1.25, 1.46],
    source: 'Grams ME et al. JAMA. 2019;322(21):2104-2114. ' +
            'CKD Prognosis Consortium meta-analysis of 49 cohorts.',
    notes: 'eGFR 45–59 mL/min/1.73m², UACR <30 mg/g, vs eGFR 95.',
  },
  {
    id: 'ckd_3b',
    label: 'Chronic kidney disease stage 3B (eGFR 30–44)',
    hr: 1.85,
    ci: [1.68, 2.04],
    source: 'Grams ME et al. JAMA. 2019;322(21):2104-2114.',
    notes: 'eGFR 30–44 mL/min/1.73m², UACR <30 mg/g, vs eGFR 95.',
  },
  {
    id: 'depression',
    label: 'Clinical depression (diagnosed)',
    hr: 1.52,
    ci: [1.38, 1.67],
    source: 'Walker ER et al. JAMA Psychiatry. 2015;72(4):334-341. ' +
            'Meta-analysis of 293 studies.',
    notes: 'Diagnosed depressive disorder vs no depression, all-cause mortality.',
  },
];

// ---------------------------------------------------------------------------
// Risk equivalents — mortality per single event, used to express Δq
// ---------------------------------------------------------------------------
const RISK_EQUIVALENTS = [
  {
    id: 'base_jump',
    label: 'base jump',
    labelPlural: 'base jumps',
    mortalityPerEvent: 1 / 2317,   // 0.0432% per jump
    source: 'Westman A et al. Scand J Trauma Resusc Emerg Med. 2008;16:3. ' +
            'Analysis of 20,850 jumps from Kjerag Massif, Norway.',
    icon: '🪂',
  },
  {
    id: 'skydive',
    label: 'skydive',
    labelPlural: 'skydives',
    mortalityPerEvent: 10 / 3700000,  // USPA 2023: ~10 deaths / 3.7M jumps
    source: 'United States Parachute Association (USPA) 2023 Fatality Summary. ' +
            'uspa.org/a-widespread-improvementthe-2023-fatality-summary',
    icon: '🪂',
  },
  {
    id: 'ct_chest',
    label: 'chest CT scan',
    labelPlural: 'chest CT scans',
    mortalityPerEvent: 0.0005,  // 0.05% cancer mortality; 7 mSv dose, BEIR VII model
    source: 'National Academies of Sciences. BEIR VII Report: Health Risks from ' +
            'Exposure to Low Levels of Ionizing Radiation. 2006. ' +
            'Chest CT effective dose ~7 mSv; linear no-threshold model applied.',
    icon: '🔬',
  },
];

/**
 * Compute the combined HR from a list of selected risk factor IDs.
 * Returns 1.0 if no factors selected.
 * @param {string[]} selectedIds
 * @returns {number} combined HR (product of individual HRs)
 */
function computeRiskHR(selectedIds) {
  if (!selectedIds || selectedIds.length === 0) return 1.0;
  return selectedIds.reduce((product, id) => {
    const factor = RISK_FACTORS.find(f => f.id === id);
    return factor ? product * factor.hr : product;
  }, 1.0);
}

/**
 * Get breakdown of individual factor contributions.
 * @param {string[]} selectedIds
 * @returns {Array<{label, hr, source}>}
 */
function getRiskBreakdown(selectedIds) {
  return (selectedIds || []).map(id => RISK_FACTORS.find(f => f.id === id)).filter(Boolean);
}
