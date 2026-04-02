/**
 * Chart rendering using Chart.js — single combined dual-axis chart.
 * Left Y-axis: VO₂ max (mL/kg/min), Right Y-axis: Annual mortality (%).
 * X-axis: Fitness percentile rank.
 * Dependency: Chart.js loaded via CDN before this file.
 */

let combinedChart = null;

const Charts = {
  getCurrentColor() { return getComputedStyle(document.documentElement).getPropertyValue('--c-current').trim() || '#0ea5a4'; },
  getPopColor() { return '#64748b'; },

  render(result) {
    this.renderCombined(result);
  },

  /**
   * Sample the spline densely to produce smooth curves.
   * Returns {percentiles, vo2Values, mortalities}.
   */
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
    // Dense sampling for smooth spline rendering
    var sampled = this.sampleCurves(result, 500);
    var percentiles = sampled.percentiles;
    var vo2Values = sampled.vo2Values;
    var mortalities = sampled.mortalities;

    // User position
    var userVo2 = result.vo2max;
    var userPercentile = result.friendPercentile;
    var userMortality = result.qUser * 100;

    // Population median
    var medianVo2 = getVo2FromPercentile(result.age, 50, result.sex);
    var medianHR = getNormalizedFitnessHR(result.age, medianVo2, result.sex);
    var medianMortality = result.qPop * medianHR * result.userRiskHR * 100;

    var currentColor = this.getCurrentColor();
    var popColor = this.getPopColor();

    var ctx = document.getElementById('combined-cdf-chart').getContext('2d');
    if (combinedChart) combinedChart.destroy();

    combinedChart = new Chart(ctx, {
      type: 'scatter',
      data: {
        datasets: [
          // VO2 curve (left axis)
          {
            label: 'VO₂ max (' + (result.sex === 'male' ? 'male' : 'female') + ', age ' + result.age + ')',
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
          // Mortality curve (right axis)
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
          },
          // User VO2 dot
          {
            label: 'Your VO₂ max',
            data: [{ x: userPercentile, y: userVo2 }],
            backgroundColor: currentColor,
            borderColor: currentColor,
            pointRadius: 8,
            pointBorderWidth: 2,
            pointBorderColor: '#fff',
            showLine: false,
            yAxisID: 'yVo2',
          },
          // User mortality dot
          {
            label: 'Your mortality',
            data: [{ x: userPercentile, y: userMortality }],
            backgroundColor: currentColor,
            borderColor: currentColor,
            pointRadius: 8,
            pointBorderWidth: 2,
            pointBorderColor: '#fff',
            pointStyle: 'rectRounded',
            showLine: false,
            yAxisID: 'yMort',
          },
          // Median VO2 triangle
          {
            label: 'Median VO₂ (50th)',
            data: [{ x: 50, y: medianVo2 }],
            backgroundColor: popColor,
            borderColor: popColor,
            pointRadius: 6,
            pointBorderWidth: 2,
            pointBorderColor: '#fff',
            pointStyle: 'triangle',
            showLine: false,
            yAxisID: 'yVo2',
          },
          // Median mortality triangle
          {
            label: 'Median mortality (50th)',
            data: [{ x: 50, y: medianMortality }],
            backgroundColor: popColor,
            borderColor: popColor,
            pointRadius: 6,
            pointBorderWidth: 2,
            pointBorderColor: '#fff',
            pointStyle: 'triangle',
            showLine: false,
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
          legend: { display: true, position: 'top' },
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
      }
    });
  }
};
