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
      `(${pctText} of healthy US adults your age, per the FRIEND Registry).`;

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
            deltaQ, categoryBounds, age, sex } = result;
    const cats = ['Elite', 'High', 'AboveAvg', 'BelowAvg', 'Low'];

    const tbody = document.getElementById('mortality-tbody');
    tbody.innerHTML = '';

    for (const cat of cats) {
      const isCurrent = cat === currentCategory;
      const q    = qUserByCategory[cat];
      const lo   = qRangeByCategory[cat].lo;
      const hi   = qRangeByCategory[cat].hi;
      const dq   = deltaQ[cat];
      const bounds = categoryBounds;

      // VO2 max range label
      let vo2Range;
      if (cat === 'Low')      vo2Range = `< ${bounds.BelowAvg.toFixed(1)}`;
      else if (cat === 'Elite') vo2Range = `≥ ${bounds.Elite.toFixed(1)}`;
      else {
        const keys = { BelowAvg: 'AboveAvg', AboveAvg: 'High', High: 'Elite' };
        vo2Range = `${bounds[cat].toFixed(1)} – ${bounds[keys[cat]].toFixed(1)}`;
      }

      const deltaCell = isCurrent
        ? '<em>your current level</em>'
        : (dq < 0
            ? `<span class="better">${fmtPercent(Math.abs(dq))} less/yr</span>`
            : `<span class="worse">+${fmtPercent(dq)} more/yr</span>`);

      const tr = document.createElement('tr');
      if (isCurrent) tr.className = 'current-row';
      tr.innerHTML = `
        <td><span class="cat-dot cat-${cat}"></span>${CAT_LABEL[cat]}${isCurrent ? ' ★' : ''}</td>
        <td>${vo2Range}</td>
        <td>${fmtPercent(q)}/yr</td>
        <td class="range-cell">${fmtPercent(lo)} – ${fmtPercent(hi)}</td>
        <td>${deltaCell}</td>
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
        const n = Math.abs(equivs[re.id]);
        return `<span class="equiv-item"><strong>${fmtEquiv(n)}</strong> ${n === 1 ? re.label : re.labelPlural}</span>`;
      }).join(' &nbsp;·&nbsp; ');

      card.innerHTML = `
        <div class="equiv-header">
          <span class="cat-badge cat-${cat}">${CAT_LABEL[cat]}</span>
          <span class="equiv-dir-label">${dir === 'better' ? '▲ better fitness' : '▼ worse fitness'}</span>
        </div>
        <p class="equiv-sentence">
          Moving from <strong>${CAT_LABEL[currentCategory]}</strong> to
          <strong>${CAT_LABEL[cat]}</strong> would
          <strong>${verb}</strong> your annual mortality by
          <strong>${fmtPercent(Math.abs(dq))}/yr</strong> —
          equivalent to ${avoid}:
        </p>
        <div class="equiv-items">${equivLines}</div>
        <p class="equiv-le">Life expectancy impact: <strong>${fmtYears(result.leDeltaByCategory[cat])}</strong></p>
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
