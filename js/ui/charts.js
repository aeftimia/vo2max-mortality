/**
 * Chart rendering using Chart.js — single combined dual-axis chart.
 * Left Y-axis: VO₂ max (mL/kg/min), Right Y-axis: Annual mortality (%).
 * X-axis: Fitness percentile rank.
 * Uses the annotation plugin for a vertical "you are here" line.
 * Dependency: Chart.js loaded via CDN before this file.
 */

let combinedChart = null;

const Charts = {
  getCurrentColor() { return getComputedStyle(document.documentElement).getPropertyValue('--c-current').trim() || '#0ea5a4'; },

  render(result) {
    this.renderCombined(result);
  },

  sampleCurves(result, nPoints) {
    var percentiles = [];
    var vo2Values = [];
    var mortalities = [];
    for (var i = 0; i <= nPoints; i++) {
      var p = (i / nPoints) * 100;
      percentiles.push(p);
      var vo2 = getVo2FromPercentile(result.age, p, result.sex);
      vo2Values.push(vo2);
      var hr = getNormalizedFitnessHR(result.age, vo2, result.sex);
      var q = result.qPop * hr * result.userRiskHR;
      mortalities.push(q * 100);
    }
    return { percentiles: percentiles, vo2Values: vo2Values, mortalities: mortalities };
  },

  renderCombined(result) {
    var sampled = this.sampleCurves(result, 500);
    var percentiles = sampled.percentiles;
    var vo2Values = sampled.vo2Values;
    var mortalities = sampled.mortalities;

    var userPercentile = result.friendPercentile;
    var currentColor = this.getCurrentColor();

    var heading = document.getElementById('chart-heading');
    if (heading) {
      heading.textContent = 'Fitness & mortality distribution — '
        + (result.sex === 'male' ? 'male' : 'female') + ', age ' + result.age;
    }

    var ctx = document.getElementById('combined-cdf-chart').getContext('2d');
    if (combinedChart) combinedChart.destroy();

    combinedChart = new Chart(ctx, {
      type: 'scatter',
      data: {
        datasets: [
          {
            label: 'VO₂ max',
            data: percentiles.map(function(p, i) { return { x: p, y: vo2Values[i] }; }),
            borderColor: '#7c3aed',
            backgroundColor: '#7c3aed20',
            borderWidth: 2,
            showLine: true,
            fill: false,
            tension: 0,
            pointRadius: 0,
            pointHoverRadius: 0,
            yAxisID: 'yVo2',
          },
          {
            label: 'Annual mortality',
            data: percentiles.map(function(p, i) { return { x: p, y: mortalities[i] }; }),
            borderColor: '#dc2635',
            backgroundColor: '#dc263520',
            borderWidth: 2,
            showLine: true,
            fill: false,
            tension: 0,
            pointRadius: 0,
            pointHoverRadius: 0,
            yAxisID: 'yMort',
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'nearest',
          intersect: false,
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: function(ctx) {
                var p = ctx.raw.x.toFixed(0);
                if (ctx.dataset.yAxisID === 'yMort') {
                  return p + 'th pctl: ' + ctx.raw.y.toFixed(4) + '% annual mortality';
                }
                return p + 'th pctl: ' + ctx.raw.y.toFixed(1) + ' mL/kg/min';
              }
            }
          },
          // Vertical "you are here" line via inline plugin
          youAreHere: {
            percentile: userPercentile,
            color: currentColor,
          }
        },
        scales: {
          x: {
            type: 'linear',
            title: { display: true, text: 'Fitness percentile rank' },
            min: 0,
            max: 100,
            ticks: { stepSize: 10 }
          },
          yVo2: {
            type: 'linear',
            position: 'left',
            title: { display: true, text: 'VO₂ max (mL/kg/min)', color: '#7c3aed' },
            ticks: { color: '#7c3aed' },
            grid: { drawOnChartArea: true },
            min: 8,
            max: Math.max.apply(null, vo2Values) + 2,
          },
          yMort: {
            type: 'linear',
            position: 'right',
            title: { display: true, text: 'Annual mortality (%)', color: '#dc2635' },
            ticks: { color: '#dc2635' },
            grid: { drawOnChartArea: false },
            min: 0,
            max: Math.max.apply(null, mortalities) * 1.1,
          }
        }
      },
      plugins: [{
        id: 'youAreHere',
        afterDraw: function(chart) {
          var opts = chart.options.plugins.youAreHere;
          if (opts == null || opts.percentile == null) return;
          var xScale = chart.scales.x;
          var xPixel = xScale.getPixelForValue(opts.percentile);
          var ctx = chart.ctx;
          ctx.save();
          ctx.beginPath();
          ctx.setLineDash([6, 4]);
          ctx.strokeStyle = opts.color || '#0ea5a4';
          ctx.lineWidth = 2;
          ctx.moveTo(xPixel, chart.chartArea.top);
          ctx.lineTo(xPixel, chart.chartArea.bottom);
          ctx.stroke();
          // Label
          ctx.setLineDash([]);
          ctx.fillStyle = opts.color || '#0ea5a4';
          ctx.font = 'bold 11px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('You (' + opts.percentile + 'th)', xPixel, chart.chartArea.top - 6);
          ctx.restore();
        }
      }]
    });
  }
};
