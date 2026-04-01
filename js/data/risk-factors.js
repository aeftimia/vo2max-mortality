/**
 * Risk Factor Hazard Ratios for All-Cause Mortality
 *
 * Each entry is a multiplicative adjustment applied to the baseline annual
 * mortality probability. The model multiplies all selected risk factor HRs
 * together (independence assumption — see methodology for limitations).
 *
 * HRs represent population-level estimates. Individual variation is large.
 * Sources are large prospective cohort studies or meta-analyses.
 *
 * Citation metadata (URLs, DOIs, full refs) lives in citations.js.
 * Each entry here stores only a citation key; use CITATIONS[key] for details.
 */
const RISK_FACTORS = [
  { id: 'diabetes',        label: 'Type 2 diabetes',            hr: 1.93, ci: [1.80, 2.08], cite: 'seshasai2011',  notes: 'Versus no diabetes.' },
  { id: 'hypertension',    label: 'Hypertension',               hr: 1.20, ci: [1.15, 1.25], cite: 'psc2002',       notes: 'Diagnosed hypertension vs normotensive.' },
  { id: 'smoking_current', label: 'Current smoker',             hr: 1.83, ci: [1.74, 1.93], cite: 'jha2013',       notes: 'Current vs never-smokers, all-cause.' },
  { id: 'smoking_former',  label: 'Former smoker (quit)',        hr: 1.34, ci: [1.27, 1.42], cite: 'jha2013',       notes: 'Former (quit ≥10y) vs never-smokers.' },
  { id: 'obesity_1',       label: 'Obesity class I (BMI 30–35)', hr: 1.12, ci: [1.06, 1.18], cite: 'berrington2010', notes: 'BMI 30–34.9 vs 22.5–24.9, never-smokers.' },
  { id: 'obesity_2',       label: 'Obesity class II (BMI 35–40)',hr: 1.27, ci: [1.17, 1.38], cite: 'berrington2010', notes: 'BMI 35–39.9 vs 22.5–24.9, never-smokers.' },
  { id: 'obesity_3',       label: 'Obesity class III (BMI ≥ 40)',hr: 1.55, ci: [1.38, 1.73], cite: 'berrington2010', notes: 'BMI ≥40 vs 22.5–24.9, never-smokers.' },
];

// ---------------------------------------------------------------------------
// Risk equivalents — mortality per single event, used to express Δq
// ---------------------------------------------------------------------------
const RISK_EQUIVALENTS = [
  { id: 'base_jump',  label: 'base jump',          labelPlural: 'base jumps',          mortalityPerEvent: 1 / 2317,     cite: 'westman2008' },
  { id: 'anesthesia', label: 'general anesthesia',  labelPlural: 'general anesthesias', mortalityPerEvent: 1 / 100000,   cite: 'braz2009' },
  { id: 'skydive',    label: 'skydive',             labelPlural: 'skydives',            mortalityPerEvent: 10 / 3700000, cite: 'uspa2023' },
];

/**
 * Compute the combined HR from a list of selected risk factor IDs.
 * Returns 1.0 if no factors selected.
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
 */
function getRiskBreakdown(selectedIds) {
  return (selectedIds || []).map(id => RISK_FACTORS.find(f => f.id === id)).filter(Boolean);
}
