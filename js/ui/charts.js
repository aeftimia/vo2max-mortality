/**
 * Chart rendering using Chart.js showing FRIEND decile bands.
 * Dependency: Chart.js loaded via CDN before this file.
 */

let mortalityChart = null;

const Charts = {
  // Return a neutral color for the band; current position will be highlighted
  getBandColor() { return '#7c3aedcc'; },
  getCurrentColor() { return getComputedStyle(document.documentElement).getPropertyValue('--c-current').trim() || '#0ea5a4'; },

  render(result) {
    this.renderMortalityBar(result);
  },

  renderMortalityBar(result) {
    // Deciles 10..90
    const deciles = [10,20,30,40,50,60,70,80,90];
    const labels = deciles.map(d => `${d}th`);

    const values = deciles.map(d => {
      const vo2 = getVo2FromPercentile(result.age, d, result.sex);
      const hr = getNormalizedFitnessHR(result.age, vo2, result.sex);
      const q = result.qPop * hr * result.userRiskHR;
      return +(q * 100).toFixed(5); // percent
    });

    const popPct = +(result.qPop * 100).toFixed(5);

    // Highlight nearest decile to user's percentile
    const userP = Math.round(result.friendPercentile);
    const nearestIdx = deciles.reduce((bestI, d, i) => Math.abs(d - userP) < Math.abs(deciles[bestI] - userP) ? i : bestI, 0);

    const backgroundColors = deciles.map((d, i) => i === nearestIdx ? this.getCurrentColor() : this.getBandColor());
    const borderColors = backgroundColors.map(c => c.replace(/cc?$/, '') );

    const ctx = document.getElementById('mortality-chart').getContext('2d');
    if (mortalityChart) mortalityChart.destroy();

    mortalityChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Annual mortality (%)',
          data: values,
          backgroundColor: backgroundColors,
          borderColor: borderColors,
          borderWidth: 1,
          borderRadius: 4,
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label(ctx) {
                return `Annual mortality: ${ctx.raw.toFixed(5)}%`;
              }
            }
          }
        },
        scales: {
          x: {
            title: { display: true, text: 'Annual mortality probability (%)' },
            ticks: { callback: v => v.toFixed(4) + '%' }
          }
        }
      }
    });

    // Draw population average dashed line
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
        c.setLineDash([6,4]);
        c.moveTo(x, top);
        c.lineTo(x, bottom);
        c.strokeStyle = '#64748b';
        c.lineWidth = 2;
        c.stroke();
        c.fillStyle = '#64748b';
        c.font = '11px sans-serif';
        c.fillText('Pop. avg', x + 4, top + 14);
        c.restore();
      }
    };
    Chart.register(popLinePlugin);
  }
};
