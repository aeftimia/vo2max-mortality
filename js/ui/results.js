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
    const { currentCategory, qUserByCategory, qRangeByCategory,
            categoryBounds } = result;
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

      const isCurrent = Math.abs(repP - result.friendPercentile) < 5;

      tr.innerHTML = `
        <td>${bandLabel}${isCurrent ? ' ★' : ''}</td>
        <td>${repVo2.toFixed(1)} mL/kg/min (approx.)</td>
        <td>${fmtPercent(q)}/yr</td>
      `;
      tbody.appendChild(tr);
    }
  },

  // ── Risk equivalents ────────────────────────────────────────────────────
  renderEquivalents(result) {
    const { age, sex, vo2max, qPop, qUser, userRiskHR } = result;
    const container = document.getElementById('equivalents-container');
    container.innerHTML = '';

    // Suggest moving up or down a decile plus extremes (top/bottom decile)
    const currentP = Math.round(getPercentileFromVo2(age, vo2max, sex));
    const decile = Math.ceil(currentP / 10) * 10;
    const targets = [Math.max(10, decile-10), decile, Math.min(90, decile+10), 10, 90];
    const uniqueTargets = Array.from(new Set(targets));
    const leCurrent = lifeExpectancy(age, sex, qUser / qPop);

    for (const p of uniqueTargets) {
      const vo2 = getVo2FromPercentile(age, p, sex);
      const hrTarget = getNormalizedFitnessHR(age, vo2, sex);
      const qUserTarget = qPop * hrTarget * userRiskHR;
      const deltaQ = qUserTarget - qUser;
      const leTarget = lifeExpectancy(age, sex, qUserTarget / qPop);
      const deltaYears = leTarget - leCurrent;

      const card = document.createElement('div');
      card.className = 'equiv-card';

      const label = p === 10 ? 'Bottom decile (10th)' : p === 90 ? 'Top decile (90th)' : `${p}th percentile (decile)`;

      card.innerHTML = `
        <div class="equiv-header">
          <strong>${label}</strong> — approx ${vo2.toFixed(1)} mL/kg/min
        </div>
        <p>
          Estimated annual mortality at this percentile: <strong>${fmtPercent(qUserTarget)}/yr</strong>.<br>
          Difference from you: <strong>${fmtPercent(deltaQ)}/yr</strong>.<br>
          Life expectancy change: <strong>${fmtYears(deltaYears)}</strong>.
        </p>
      `;
      container.appendChild(card);
    }
  },

  // ── Life expectancy summary ─────────────────────────────────────────────
  renderLE(result) {
    const { currentCategory, leDeltaByCategory, lePopulation } = result;
    const eliteLE  = leDeltaByCategory['Elite'];
    const lowLE    = leDeltaByCategory['Low'];
    const el       = document.getElementById('le-summary');

    if (!el) return;
    el.innerHTML = `
      Compared to your current fitness level: moving to <strong>Elite</strong> would add
      approximately <strong>${fmtYears(eliteLE)}</strong> of remaining life expectancy.
      Declining to <strong>Low</strong> fitness would subtract
      approximately <strong>${fmtYears(Math.abs(lowLE))}</strong>
      (based on ${citeLink('ssaLifeTable', 'SSA 2021 life table')} integration).
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
