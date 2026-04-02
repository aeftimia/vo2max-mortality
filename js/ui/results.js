/**
 * Results rendering — populates the results section of the page.
 * Dependencies: formatter.js, risk-factors.js (RISK_EQUIVALENTS)
 */

const Results = {
  render(result) {
    this.renderHero(result);
    this.renderTable(result);
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
      `<br>The calculator uses a continuous hazard model (Kokkinos 2022; HR = 0.86 per +1 MET) normalized to population life tables.`;

    const riskNote = userRiskHR > 1
      ? ` With your health conditions (combined HR ${userRiskHR.toFixed(2)}×), your personal estimate is higher.`
      : '';

    document.getElementById('hero-mortality').innerHTML =
      `Estimated annual mortality risk: <strong>${fmtPercent(qUser)}/year</strong>` +
      ` &nbsp;|&nbsp; Population average for ${age}-year-old ${sexLabel}s: ${fmtPercent(qPop)}/year.` +
      riskNote;
  },


  // ── Mortality table ─────────────────────────────────────────────────────
  renderTable(result) {
    // Use FRIEND percentiles display rather than Mandsager bins
    const cats = ['p90', 'p80', 'p70', 'p60', 'p50', 'p40', 'p30', 'p20', 'p10'];

    // Category bounds are no longer used for computation; show FRIEND percentile bands for display
    const boundsLabel = {
      p90: '≥ 90th percentile', p80: '80–89th', p70: '70–79th', p60: '60–69th',
      p50: '50–59th', p40: '40–49th', p30: '30–39th', p20: '20–29th', p10: '≤ 19th'
    };

    const tbody = document.getElementById('mortality-tbody');
    tbody.innerHTML = '';

    // For FRIEND bands, compute representative VO2 and continuous HR for display
    for (const band of cats) {
      const tr = document.createElement('tr');
      const bandLabel = boundsLabel[band];

      // Representative percentile for band
      const repP = parseInt(band.slice(1)); // e.g., 'p90' -> 90
      const repVo2 = getVo2FromPercentile(result.age, repP, result.sex);
      const hr = getNormalizedFitnessHR(result.age, repVo2, result.sex);
      const q = result.qPop * hr * result.userRiskHR;

      // Compute CI range for this percentile using Kokkinos 95% CI (0.85–0.87 per MET)
      const MET = repVo2 / 3.5;
      const k = getNormalizationConstant(result.age, result.sex);
      const k_margin = k * 0.01;  // small margin for spline fit uncertainty
      const hrLo = (k - k_margin) * Math.pow(0.85, MET);
      const hrHi = (k + k_margin) * Math.pow(0.87, MET);
      const qLo = result.qPop * hrLo * result.userRiskHR;
      const qHi = result.qPop * hrHi * result.userRiskHR;
      const ciTooltip = `Plausible range: ${fmtPercent(qLo)} – ${fmtPercent(qHi)}/yr (HR 95% CIs)`;

      const isCurrent = Math.abs(repP - result.friendPercentile) < 5;

      tr.innerHTML = `
        <td>${bandLabel}${isCurrent ? ' ★' : ''}</td>
        <td>${repVo2.toFixed(1)} mL/kg/min (approx.)</td>
        <td title="${ciTooltip}">${fmtPercent(q)}/yr <span class="equiv-tip">ⓘ</span></td>
      `;
      tbody.appendChild(tr);
    }
  },

  // ── Risk equivalents ────────────────────────────────────────────────────
  renderEquivalents(result) {
    const { age, sex, vo2max, qPop, qUser, userRiskHR } = result;
    const container = document.getElementById('equivalents-container');
    container.innerHTML = '';

    // Suggest meaningful moves: adjacent deciles (up/down from current) + extremes
    const currentP = Math.round(getPercentileFromVo2(age, vo2max, sex));
    const currentDecile = Math.ceil(currentP / 10) * 10;
    
    // Show: decile below (if exists), decile above (if exists), 10th, 90th
    const targets = [];
    if (currentDecile > 10) targets.push(currentDecile - 10);  // decile below
    if (currentDecile < 90) targets.push(currentDecile + 10);  // decile above
    targets.push(10, 90);  // extremes
    
    const uniqueTargets = Array.from(new Set(targets)).sort((a, b) => a - b);
    const leCurrent = lifeExpectancy(age, sex, qUser / qPop);

    for (const p of uniqueTargets) {
      const vo2 = getVo2FromPercentile(age, p, sex);
      const hrTarget = getNormalizedFitnessHR(age, vo2, sex);
      const qUserTarget = qPop * hrTarget * userRiskHR;
      const deltaQ = qUserTarget - qUser;
      const leTarget = lifeExpectancy(age, sex, qUserTarget / qPop);
      const deltaYears = leTarget - leCurrent;

      // Compute CI plausible range for deltaQ
      const MET = vo2 / 3.5;
      const k = getNormalizationConstant(age, sex);
      const k_margin = k * 0.01;
      const hrTargetLo = (k - k_margin) * Math.pow(0.85, MET);
      const hrTargetHi = (k + k_margin) * Math.pow(0.87, MET);
      const qTargetLo = qPop * hrTargetLo * userRiskHR;
      const qTargetHi = qPop * hrTargetHi * userRiskHR;
      const deltaQLo = qTargetLo - qUser;
      const deltaQHi = qTargetHi - qUser;
      const [dqA, dqB] = Math.abs(deltaQLo) <= Math.abs(deltaQHi) ? [deltaQLo, deltaQHi] : [deltaQHi, deltaQLo];
      const dqTip = `Plausible range: ${fmtPercent(dqA)} to ${fmtPercent(dqB)}/yr (HR 95% CIs)`;

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
      const avoid = deltaQ < 0 ? 'avoiding' : 'adding';
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
        <p class="equiv-le">Life expectancy change: <strong>${fmtYears(deltaYears)}</strong></p>
      `;
      container.appendChild(card);
    }
  },

  // ── Life expectancy summary ─────────────────────────────────────────────
  renderLE(result) {
    const { leCurrent, lePopulation, leUserRange, age, sex, qPop, qUser, userRiskHR } = result;
    const el = document.getElementById('le-summary');

    if (!el) return;
    
    // Compute LE impact for top and bottom deciles for comparison
    const vo2Top = getVo2FromPercentile(age, 90, sex);
    const vo2Bottom = getVo2FromPercentile(age, 10, sex);
    const leTop = lifeExpectancy(age, sex, (qPop * getNormalizedFitnessHR(age, vo2Top, sex) * userRiskHR) / qPop);
    const leBottom = lifeExpectancy(age, sex, (qPop * getNormalizedFitnessHR(age, vo2Bottom, sex) * userRiskHR) / qPop);
    
    el.innerHTML = `
      Your current fitness level implies a remaining life expectancy of approximately
      <strong>${fmtYears(leCurrent)}</strong> years (vs. population average of 
      <strong>${fmtYears(lePopulation)}</strong> years).
      <br><br>
      <strong>Fitness impact on life expectancy:</strong><br>
      If you improved to the <strong>90th percentile</strong> (top decile): <strong>+${fmtYears(leTop - leCurrent)}</strong>.<br>
      If you declined to the <strong>10th percentile</strong> (bottom decile): <strong>${fmtYears(leBottom - leCurrent)}</strong>.
      <br><br>
      <span class="small muted">(Based on ${citeLink('ssaLifeTable', 'SSA 2022 life table')} 
      integration with continuous FRIEND+Kokkinos fitness model. Plausible range from HR 95% CI: ${fmtYears(leUserRange.lo)} to 
      ${fmtYears(leUserRange.hi)} years.)</span>
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
