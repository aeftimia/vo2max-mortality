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
    const { age, sex, vo2max, currentCategory, categoryLabel,
            friendPercentile, qUser, qPop, userRiskHR } = result;

    const sexLabel = sex === 'male' ? 'male' : 'female';
    const pctText  = friendPercentile < 5  ? 'below the 5th percentile'
                   : friendPercentile > 95 ? 'above the 95th percentile'
                   : `approximately the ${friendPercentile}th percentile`;

    document.getElementById('hero-fitness').innerHTML =
      `Your VO₂ max of <strong>${vo2max.toFixed(1)} mL/kg/min</strong> places you in the ` +
      `<strong class="cat-${currentCategory}">${categoryLabel}</strong> fitness category ` +
      `for a ${age}-year-old ${sexLabel} ` +
      `(<a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC6324439/" target="_blank" rel="noopener">Mandsager 2018</a>).` +
      `<br>Among healthy US adults your age, this is ${pctText} ` +
      `(<a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC4919021/" target="_blank" rel="noopener">FRIEND Registry</a> — ` +
      `separate norms, different thresholds from the Mandsager categories above).`;

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
    const cats = ['Elite', 'High', 'AboveAvg', 'BelowAvg', 'Low'];

    const tbody = document.getElementById('mortality-tbody');
    tbody.innerHTML = '';

    for (const cat of cats) {
      const isCurrent = cat === currentCategory;
      const q    = qUserByCategory[cat];
      const lo   = qRangeByCategory[cat].lo;
      const hi   = qRangeByCategory[cat].hi;
      const bounds = categoryBounds;

      // VO2 max range label
      let vo2Range;
      if (cat === 'Low')      vo2Range = `< ${bounds.BelowAvg.toFixed(1)}`;
      else if (cat === 'Elite') vo2Range = `≥ ${bounds.Elite.toFixed(1)}`;
      else {
        const keys = { BelowAvg: 'AboveAvg', AboveAvg: 'High', High: 'Elite' };
        vo2Range = `${bounds[cat].toFixed(1)} – ${bounds[keys[cat]].toFixed(1)}`;
      }

      const rangeTooltip = `Plausible range: ${fmtPercent(lo)} – ${fmtPercent(hi)}/yr (HR 95% CIs)`;

      const tr = document.createElement('tr');
      if (isCurrent) tr.className = 'current-row';
      tr.innerHTML = `
        <td><span class="cat-dot cat-${cat}"></span>${CAT_LABEL[cat]}${isCurrent ? ' ★' : ''}</td>
        <td>${vo2Range}</td>
        <td title="${rangeTooltip}">${fmtPercent(q)}/yr <span class="equiv-tip">ⓘ</span></td>
      `;
      tbody.appendChild(tr);
    }
  },

  // ── Risk equivalents ────────────────────────────────────────────────────
  renderEquivalents(result) {
    const { currentCategory, deltaQ, riskEquivByCategory } = result;
    const container = document.getElementById('equivalents-container');
    container.innerHTML = '';

    const better = ['Elite', 'High', 'AboveAvg', 'BelowAvg'].filter(
      c => c !== currentCategory && CATEGORIES.indexOf(c) > CATEGORIES.indexOf(currentCategory)
    );
    const worse  = ['BelowAvg', 'Low', 'AboveAvg', 'High'].filter(
      c => c !== currentCategory && CATEGORIES.indexOf(c) < CATEGORIES.indexOf(currentCategory)
    );
    // Actually, let's order properly
    const allOther = ['Low', 'BelowAvg', 'AboveAvg', 'High', 'Elite'].filter(
      c => c !== currentCategory
    );

    for (const cat of allOther) {
      const dq     = deltaQ[cat];
      const equivs = riskEquivByCategory[cat];
      const dir    = dq < 0 ? 'better' : 'worse';
      const verb   = dq < 0 ? 'reduce' : 'increase';
      const avoid  = dq < 0 ? 'avoiding' : 'adding';

      const card = document.createElement('div');
      card.className = `equiv-card equiv-${dir}`;

      const equivLines = RISK_EQUIVALENTS.map(re => {
        const n    = Math.abs(equivs[re.id]);
        const rang = result.riskEquivRangeByCategory[cat][re.id];
        const rLo  = Math.abs(rang.lo);
        const rHi  = Math.abs(rang.hi);
        const [ra, rb] = rLo <= rHi ? [rLo, rHi] : [rHi, rLo];
        const tipText = `Plausible range: ${fmtEquiv(ra)} – ${fmtEquiv(rb)} ${n === 1 ? re.label : re.labelPlural}/yr (based on HR 95% CIs)`;
        return `<span class="equiv-item" title="${tipText}"><strong class="equiv-val">${fmtEquiv(n)}</strong> ${n === 1 ? re.label : re.labelPlural}<span class="equiv-tip">ⓘ</span></span>`;
      }).join(' &nbsp;·&nbsp; ');

      // Δq plausible range tooltip
      const dqRange = result.deltaQRangeByCategory[cat];
      const dqLo = Math.abs(dqRange.lo);
      const dqHi = Math.abs(dqRange.hi);
      const [dqA, dqB] = dqLo <= dqHi ? [dqLo, dqHi] : [dqHi, dqLo];
      const dqTip = `Plausible range: ${fmtPercent(dqA)} – ${fmtPercent(dqB)}/yr (HR 95% CIs)`;

      // LE plausible range tooltip
      const leD = result.leDeltaByCategory[cat];
      const leRange = result.leDeltaRangeByCategory[cat];
      const leLo = leRange.lo;
      const leHi = leRange.hi;
      const [leA, leB] = Math.abs(leLo) <= Math.abs(leHi) ? [leLo, leHi] : [leHi, leLo];
      const leTip = `Plausible range: ${fmtYears(leA)} to ${fmtYears(leB)} (HR 95% CIs)`;

      card.innerHTML = `
        <div class="equiv-header">
          <span class="cat-badge cat-${cat}">${CAT_LABEL[cat]}</span>
          <span class="equiv-dir-label">${dir === 'better' ? '▲ better fitness' : '▼ worse fitness'}</span>
        </div>
        <p class="equiv-sentence">
          Moving from <strong>${CAT_LABEL[currentCategory]}</strong> to
          <strong>${CAT_LABEL[cat]}</strong> would
          <strong>${verb}</strong> your annual mortality by
          <span title="${dqTip}" style="cursor:help"><strong>${fmtPercent(Math.abs(dq))}/yr</strong> <span class="equiv-tip">ⓘ</span></span> —
          equivalent to ${avoid}:
        </p>
        <div class="equiv-items">${equivLines}</div>
        <p class="equiv-le" title="${leTip}" style="cursor:help">Life expectancy impact: <strong>${fmtYears(leD)}</strong> <span class="equiv-tip">ⓘ</span></p>
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
      (based on SSA 2021 life table integration).
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
