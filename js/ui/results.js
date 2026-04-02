/**
 * Results rendering — populates the results section of the page.
 * Dependencies: formatter.js, risk-factors.js (RISK_EQUIVALENTS)
 */

const Results = {
  render(result) {
    this.renderHero(result);
    this.renderEquivalents(result);
    this.renderLE(result);
    this.renderRiskBreakdown(result);
    Charts.render(result);
  },

  // ── Hero summary ────────────────────────────────────────────────────────
  renderHero(result) {
    const { age, sex, vo2max, friendPercentile, qUser, qPop, userRiskHR, leCurrent } = result;

    const sexLabel = sex === 'male' ? 'male' : 'female';
    const pctText  = friendPercentile < 5  ? 'below the 5th percentile'
                   : friendPercentile > 95 ? 'above the 95th percentile'
                   : `approximately the ${friendPercentile}th percentile`;

    document.getElementById('hero-fitness').innerHTML =
      `Your VO₂ max of <strong>${vo2max.toFixed(1)} mL/kg/min</strong> is ${pctText} among healthy US adults of your age and sex.` +
      `<br>This percentile is estimated from the FRIEND 2022 normative data (${citeLink('friend2022')}).` +
      `<br>The calculator uses a continuous hazard model (${citeLink('kokkinos2022')}; HR = ${((FRIEND_2022_CONTINUOUS.metadata || {}).constants || {}).HR_per_MET || 0.86} per +1 MET) normalized to population life tables.`;

    const riskNote = userRiskHR > 1
      ? ` With your health conditions (combined HR ${userRiskHR.toFixed(2)}×), your personal estimate is higher.`
      : '';

    document.getElementById('hero-mortality').innerHTML =
      `Estimated annual mortality risk: <strong>${fmtPercent(qUser)}/year</strong>` +
      ` &nbsp;|&nbsp; Population average for ${age}-year-old ${sexLabel}s: ${fmtPercent(qPop)}/year.` +
      riskNote;
  },


  // ── Risk equivalents ────────────────────────────────────────────────────
  renderEquivalents(result) {
    const { age, sex, vo2max, qPop, qUser, userRiskHR } = result;
    const container = document.getElementById('equivalents-container');
    container.innerHTML = '';

    // Suggest meaningful moves: adjacent deciles (up/down from current) + extremes
    // Only include targets that differ meaningfully from the user's current percentile
    const rawPercentile = getPercentileFromVo2(age, vo2max, sex);
    if (rawPercentile === null) {
      container.innerHTML = '<p class="equiv-error">Could not determine fitness percentile. FRIEND data may not have loaded.</p>';
      return;
    }
    const currentP = Math.round(rawPercentile);
    const currentDecile = Math.ceil(currentP / 10) * 10;

    // Show: decile below (if exists), decile above (if exists), 10th, 90th
    const targets = [];
    if (currentDecile > 10) targets.push(currentDecile - 10);
    if (currentDecile < 90) targets.push(currentDecile + 10);
    if (currentP > 15) targets.push(10);   // only show 10th if user is meaningfully above it
    if (currentP < 85) targets.push(90);   // only show 90th if user is meaningfully below it

    const uniqueTargets = Array.from(new Set(targets))
      .filter(p => Math.abs(p - currentP) >= 5)  // skip targets too close to current
      .sort((a, b) => a - b);
    const leCurrent = lifeExpectancy(age, sex, qUser / qPop);

    for (const p of uniqueTargets) {
      const vo2 = getVo2FromPercentile(age, p, sex);
      const hrTarget = getNormalizedFitnessHR(age, vo2, sex);
      const qUserTarget = qPop * hrTarget * userRiskHR;
      const deltaQ = qUserTarget - qUser;
      const leTarget = lifeExpectancy(age, sex, qUserTarget / qPop);
      const deltaYears = leTarget - leCurrent;

      // Compute CI plausible range for deltaQ
      // Each CI bound uses its own normalization constant (precomputed)
      const hrTargetLo = getNormalizedFitnessHR(age, vo2, sex, 'lo');
      const hrTargetHi = getNormalizedFitnessHR(age, vo2, sex, 'hi');
      const qTargetLo = qPop * hrTargetLo * userRiskHR;
      const qTargetHi = qPop * hrTargetHi * userRiskHR;
      const deltaQLo = qTargetLo - qUser;
      const deltaQHi = qTargetHi - qUser;
      const [dqA, dqB] = Math.abs(deltaQLo) <= Math.abs(deltaQHi) ? [deltaQLo, deltaQHi] : [deltaQHi, deltaQLo];
      const dqTip = `Plausible range: ${fmtPercent(dqA)} to ${fmtPercent(dqB)}/yr (HR 95% CIs)`;

      // CI range for life expectancy delta
      const leTargetLo = lifeExpectancy(age, sex, qTargetHi / qPop); // higher q -> lower LE
      const leTargetHi = lifeExpectancy(age, sex, qTargetLo / qPop);
      const deltaYearsLo = leTargetLo - leCurrent;
      const deltaYearsHi = leTargetHi - leCurrent;
      const leDeltaTip = `Plausible range: ${fmtYears(deltaYearsLo)} to ${fmtYears(deltaYearsHi)} (HR 95% CIs)`;

      // Risk equivalents for this deltaQ
      const equivLines = RISK_EQUIVALENTS.map(re => {
        const n = Math.abs(deltaQ) / re.mortalityPerEvent;
        const nLo = Math.abs(dqA) / re.mortalityPerEvent;
        const nHi = Math.abs(dqB) / re.mortalityPerEvent;
        const [nMinCI, nMaxCI] = nLo <= nHi ? [nLo, nHi] : [nHi, nLo];
        const tipText = `Plausible range: ${fmtEquiv(nMinCI)} – ${fmtEquiv(nMaxCI)} ${n >= 1 ? re.labelPlural : re.label}/yr (HR 95% CIs)`;
        return `<span class="equiv-item" title="${tipText}"><strong class="equiv-val">${fmtEquiv(n)}</strong> ${n >= 1 ? re.labelPlural : re.label}<span class="equiv-tip">ⓘ</span></span>`;
      }).join(' &nbsp;·&nbsp; ');

      const card = document.createElement('div');
      const dir = deltaQ < 0 ? 'better' : 'worse';
      card.className = `equiv-card equiv-${dir}`;

      const label = p === 10 ? '10th percentile' : p === 90 ? '90th percentile' : `${p}th percentile`;
      const verb = deltaQ < 0 ? 'reduce' : 'increase';
      const avoid = deltaQ < 0 ? 'annually avoiding' : 'annually adding';
      const dirLabel = dir === 'better' ? '▲ better fitness' : '▼ worse fitness';

      card.innerHTML = `
        <div class="equiv-header">
          <span class="equiv-label">${label}</span>
          <span class="equiv-dir-label">${dirLabel}</span>
        </div>
        <div style="font-size: 0.875rem; margin-bottom: 0.5rem; color: var(--muted);">
          ≈ ${vo2.toFixed(1)} mL/kg/min
        </div>
        <p class="equiv-sentence">
          Moving to this percentile would ${verb} your annual mortality by
          <span title="${dqTip}" style="cursor:help"><strong>${fmtPercent(Math.abs(deltaQ))}/yr</strong> <span class="equiv-tip">ⓘ</span></span> —
          equivalent to ${avoid}:
        </p>
        <div class="equiv-items">${equivLines}</div>
        <p class="equiv-le">Life expectancy change: <strong title="${leDeltaTip}" style="cursor:help">${fmtYears(deltaYears)} <span class="equiv-tip">ⓘ</span></strong></p>
      `;
      container.appendChild(card);
    }
  },

  // ── Life expectancy summary ─────────────────────────────────────────────
  renderLE(result) {
    const { leCurrent, lePopulation, leUserRange, age, sex, qPop, qUser, userRiskHR, friendPercentile } = result;
    const el = document.getElementById('le-summary');

    if (!el) return;

    const currentTip = `Plausible range: ${fmtAbsYears(leUserRange.lo)} – ${fmtAbsYears(leUserRange.hi)} years (HR 95% CIs)`;

    // Build comparison lines for percentiles above and below the user
    function leAtPercentile(p) {
      const vo2 = getVo2FromPercentile(age, p, sex);
      return lifeExpectancy(age, sex, (qPop * getNormalizedFitnessHR(age, vo2, sex) * userRiskHR) / qPop);
    }
    function leCIRange(p) {
      const vo2 = getVo2FromPercentile(age, p, sex);
      const lo = lifeExpectancy(age, sex, (qPop * getNormalizedFitnessHR(age, vo2, sex, 'hi') * userRiskHR) / qPop);
      const hi = lifeExpectancy(age, sex, (qPop * getNormalizedFitnessHR(age, vo2, sex, 'lo') * userRiskHR) / qPop);
      return { lo, hi };
    }

    const comparisons = [];
    // Pick one target above and one below, skipping if user is already at/beyond the extreme
    const targets = [
      { p: 90, labelUp: 'improved to the <strong>90th percentile</strong> (top decile)' },
      { p: 10, labelDown: 'declined to the <strong>10th percentile</strong> (bottom decile)' },
    ];

    for (const t of targets) {
      if (Math.abs(t.p - friendPercentile) < 3) continue; // skip if user is already ~there
      const le = leAtPercentile(t.p);
      const delta = le - leCurrent;
      const ci = leCIRange(t.p);
      const tip = `Plausible range: ${fmtYears(ci.lo - leCurrent)} to ${fmtYears(ci.hi - leCurrent)} (HR 95% CIs)`;
      const verb = delta >= 0 ? 'improved' : 'declined';
      const label = t.p > friendPercentile
        ? (t.labelUp || `improved to the <strong>${t.p}th percentile</strong>`)
        : (t.labelDown || `declined to the <strong>${t.p}th percentile</strong>`);
      comparisons.push(
        `If you ${label}: <strong title="${tip}" style="cursor:help">${fmtYears(delta)} <span class="equiv-tip">ⓘ</span></strong>.`
      );
    }

    el.innerHTML = `
      Your current fitness level implies a remaining life expectancy of approximately
      <strong title="${currentTip}" style="cursor:help">${fmtAbsYears(leCurrent)} <span class="equiv-tip">ⓘ</span></strong> years (vs. population average of
      <strong>${fmtAbsYears(lePopulation)}</strong> years).
      ${comparisons.length ? '<br><br><strong>Fitness impact on life expectancy:</strong><br>' + comparisons.join('<br>') : ''}
      <br><br>
      <span class="small muted">(Based on ${citeLink('ssaLifeTable', 'SSA 2022 life table')}
      integration with continuous FRIEND+Kokkinos fitness model.)</span>
    `;
  },

  // ── Risk factor breakdown ───────────────────────────────────────────────
  renderRiskBreakdown(result) {
    const { riskFactors, userRiskHR } = result;
    const el = document.getElementById('risk-breakdown');
    if (!el) return;
    if (!riskFactors || riskFactors.length === 0) {
      el.style.display = 'none';
      return;
    }
    el.style.display = 'block';
    const breakdown = getRiskBreakdown(riskFactors);
    const rows = breakdown.map(f =>
      `<tr><td>${f.label}</td><td>${f.hr.toFixed(2)}×</td></tr>`
    ).join('');
    el.innerHTML = `
      <h4>Your risk factor adjustments</h4>
      <table class="rf-table">
        <thead><tr><th>Condition</th><th>HR</th></tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr><td><strong>Combined</strong></td><td><strong>${userRiskHR.toFixed(2)}×</strong></td></tr></tfoot>
      </table>
      <p class="rf-note">HRs applied multiplicatively (independence assumption; see <a href="methodology.html">methodology</a>).</p>
    `;
  },
};
