/**
 * Chart rendering using Chart.js — single combined dual-axis chart.
 * Left Y-axis: fitness metric value, Right Y-axis: Annual mortality (%).
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
    var metric = result.metric || 'vo2max';
    var percentiles = [];
    var metricValues = [];
    var mortalities = [];
    for (var i = 0; i <= nPoints; i++) {
      var p = (i / nPoints) * 100;
      percentiles.push(p);
      var val = getMetricFromPercentile(result.age, p, result.sex, metric);
      metricValues.push(val);
      var hr = getNormalizedFitnessHR(result.age, val, result.sex, 'central', metric);
      var q = result.qPop * hr * result.userRiskHR;
      mortalities.push(q * 100);
    }
    return { percentiles: percentiles, metricValues: metricValues, vo2Values: metricValues, mortalities: mortalities };
  },

  renderCombined(result) {
    var metric = result.metric || 'vo2max';
    var info = getMetricInfo(metric);
    var sampled = this.sampleCurves(result, 500);
    var percentiles = sampled.percentiles;
    var metricValues = sampled.metricValues;
    var mortalities = sampled.mortalities;

    var userPercentile = result.friendPercentile;
    var currentColor = this.getCurrentColor();

    var heading = document.getElementById('chart-heading');
    if (heading) {
      heading.textContent = 'Fitness & mortality distribution \u2014 '
        + (result.sex === 'male' ? 'male' : 'female') + ', age ' + result.age;
    }

    // Update chart description
    var chartDesc = document.getElementById('chart-description');
    if (chartDesc) {
      chartDesc.textContent = 'Shows ' + info.label + ' (purple, left axis) and annual mortality (red, right axis) across fitness percentiles. Dashed teal line = your position.';
    }

    var ctx = document.getElementById('combined-cdf-chart').getContext('2d');
    if (combinedChart) combinedChart.destroy();

    combinedChart = new Chart(ctx, {
      type: 'scatter',
      data: {
        datasets: [
          {
            label: info.label,
            data: percentiles.map(function(p, i) { return { x: p, y: metricValues[i] }; }),
            borderColor: '#7c3aed',
            backgroundColor: '#7c3aed20',
            borderWidth: 2,
            showLine: true,
            fill: false,
            tension: 0,
            pointRadius: 0,
            pointHoverRadius: 0,
            yAxisID: 'yMetric',
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
        layout: { padding: { top: 24, bottom: 0 } },
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
                return p + 'th pctl: ' + ctx.raw.y.toFixed(1) + ' ' + info.unit;
              }
            }
          },
          youAreHere: {
            percentile: userPercentile,
            color: currentColor,
          }
        },
        scales: {
          x: {
            type: 'linear',
            title: { display: true, text: 'Fitness percentile rank', padding: { top: 2, bottom: 0 } },
            min: 0,
            max: 100,
            ticks: { stepSize: 10 }
          },
          yMetric: {
            type: 'linear',
            position: 'left',
            title: { display: true, text: info.label + ' (' + info.unit + ')', color: '#7c3aed' },
            ticks: { color: '#7c3aed' },
            grid: { drawOnChartArea: true },
            min: Math.max(0, Math.min.apply(null, metricValues) - 2),
            max: Math.max.apply(null, metricValues) + 2,
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
          ctx.setLineDash([]);
          ctx.fillStyle = opts.color || '#0ea5a4';
          ctx.font = 'bold 11px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          ctx.fillText('You (' + opts.percentile + 'th)', xPixel, chart.chartArea.top - 4);
          ctx.restore();
        }
      }]
    });
  }
};
