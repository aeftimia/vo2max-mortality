/**
 * Chart rendering using Chart.js.
 * Dependency: Chart.js loaded via CDN before this file.
 */

let mortalityChart = null;

const Charts = {
  // Read colors from CSS custom properties (single source of truth in main.css)
  getColor(cat) {
    const varMap = { Low: '--c-low', BelowAvg: '--c-below', AboveAvg: '--c-above',
                     High: '--c-high', Elite: '--c-elite', current: '--c-current' };
    return getComputedStyle(document.documentElement).getPropertyValue(varMap[cat]).trim();
  },

  render(result) {
    this.renderMortalityBar(result);
  },

  renderMortalityBar(result) {
    const cats = ['Low', 'BelowAvg', 'AboveAvg', 'High', 'Elite'];
    const labels = cats.map(c => CAT_LABEL[c]);
    const values = cats.map(c => +(result.qUserByCategory[c] * 100).toFixed(4));
    const errorBarsLo = cats.map(c => +(result.qRangeByCategory[c].lo * 100).toFixed(4));
    const errorBarsHi = cats.map(c => +(result.qRangeByCategory[c].hi * 100).toFixed(4));

    const backgroundColors = cats.map(c =>
      c === result.currentCategory ? this.getColor('current') : this.getColor(c)
    );
    const borderColors = backgroundColors;

    const ctx = document.getElementById('mortality-chart').getContext('2d');
    if (mortalityChart) mortalityChart.destroy();

    // Population average as a scatter point / vertical reference
    const popPct = +(result.qPop * 100).toFixed(4);

    mortalityChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Annual mortality (%)',
            data: values,
            backgroundColor: backgroundColors.map(c => c + 'cc'),
            borderColor: borderColors,
            borderWidth: 2,
            borderRadius: 4,
          },
          // Invisible scatter dataset used only for population avg tooltip
          {
            type: 'scatter',
            label: `Population avg (${popPct}%)`,
            data: cats.map(() => ({ x: popPct, y: null })),
            pointRadius: 0,
            showLine: false,
          },
        ],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: true,
            labels: {
              filter: item => item.datasetIndex === 1,  // only show pop avg legend
              boxWidth: 20,
              font: { size: 11 },
            },
          },
          tooltip: {
            filter: item => item.datasetIndex === 0,
            callbacks: {
              label(ctx) {
                const cat = cats[ctx.dataIndex];
                const lo  = errorBarsLo[ctx.dataIndex];
                const hi  = errorBarsHi[ctx.dataIndex];
                return [
                  `Annual mortality: ${ctx.raw.toFixed(4)}%`,
                  `Plausible range: ${lo.toFixed(4)}% – ${hi.toFixed(4)}%`,
                  cat === result.currentCategory ? '← Your current level' : '',
                ].filter(Boolean);
              },
            },
          },
        },
        scales: {
          x: {
            title: {
              display: true,
              text: 'Annual mortality probability (%)',
            },
            ticks: {
              callback: v => v.toFixed(3) + '%',
            },
          },
          y: {
            ticks: {
              font: { weight: 'normal' },
            },
          },
        },
      },
    });

    // Draw population average dashed line as a plugin (no external dependency)
    if (mortalityChart._popLinePlugin) {
      Chart.unregister(mortalityChart._popLinePlugin);
    }
    const popLinePlugin = {
      id: 'popLine_' + Date.now(),
      afterDraw(chart) {
        const xScale = chart.scales.x;
        const yScale = chart.scales.y;
        if (!xScale || !yScale) return;
        const x = xScale.getPixelForValue(popPct);
        const { top, bottom } = yScale;
        const { ctx: c } = chart;
        c.save();
        c.beginPath();
        c.setLineDash([6, 4]);
        c.moveTo(x, top);
        c.lineTo(x, bottom);
        c.strokeStyle = '#64748b';
        c.lineWidth = 2;
        c.stroke();
        c.fillStyle = '#64748b';
        c.font = '11px sans-serif';
        c.fillText('Pop. avg', x + 4, top + 14);
        c.restore();
      },
    };
    Chart.register(popLinePlugin);
    mortalityChart.update();
  },
};
