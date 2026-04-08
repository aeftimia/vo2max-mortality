/**
 * Chart rendering using Chart.js — mortality vs biometric value.
 *
 * Plots the continuous hazard model (mortality as a function of the fitness
 * metric value) directly, without quantile transforms. The y-axis units are
 * user-toggleable: annual mortality probability or any of the risk-equivalent
 * units (events/year of equivalent risk) defined in RISK_EQUIVALENTS.
 *
 * Dependency: Chart.js loaded via CDN before this file.
 */

let combinedChart = null;

const Charts = {
  // Currently selected unit id; null = annual mortality (%).
  unitId: null,
  // Last result rendered, so unit changes can re-render without recomputation.
  lastResult: null,

  getCurrentColor() { return getComputedStyle(document.documentElement).getPropertyValue('--c-current').trim() || '#0ea5a4'; },

  /**
   * Available y-axis units. The first entry is the default (annual mortality %).
   * For event-based units, the value is q / mortalityPerEvent — i.e. the number
   * of events per year that would carry an equivalent annual mortality risk.
   */
  units() {
    var units = [{
      id: '__pct',
      label: 'Annual mortality (%)',
      axisLabel: 'Annual mortality (%)',
      transform: function(q) { return q * 100; },
      format: function(v) { return v.toFixed(4) + '%'; },
    }];
    (typeof RISK_EQUIVALENTS !== 'undefined' ? RISK_EQUIVALENTS : []).forEach(function(eq) {
      units.push({
        id: eq.id,
        label: eq.labelPlural.charAt(0).toUpperCase() + eq.labelPlural.slice(1) + ' per year',
        axisLabel: eq.labelPlural.charAt(0).toUpperCase() + eq.labelPlural.slice(1) + ' / year (equivalent risk)',
        transform: function(q) { return q / eq.mortalityPerEvent; },
        format: function(v) { return v.toFixed(2) + ' ' + eq.labelPlural + '/yr'; },
      });
    });
    return units;
  },

  getActiveUnit() {
    var all = this.units();
    for (var i = 0; i < all.length; i++) if (all[i].id === this.unitId) return all[i];
    return all[0];
  },

  populateUnitSelect() {
    var sel = document.getElementById('mortality-unit');
    if (!sel || sel.dataset.populated === '1') return;
    var all = this.units();
    var self = this;
    all.forEach(function(u) {
      var opt = document.createElement('option');
      opt.value = u.id;
      opt.textContent = u.label;
      sel.appendChild(opt);
    });
    sel.value = this.unitId || all[0].id;
    sel.addEventListener('change', function() {
      self.unitId = sel.value;
      if (self.lastResult) self.renderCombined(self.lastResult);
    });
    sel.dataset.populated = '1';
  },

  render(result) {
    this.lastResult = result;
    this.populateUnitSelect();
    this.renderCombined(result);
  },

  /**
   * Sample mortality vs biometric value across the metric's valid range.
   */
  sampleCurve(result, nPoints) {
    var metric = result.metric || 'vo2max';
    var info = getMetricInfo(metric);
    var minV = info.minValue;
    var maxV = info.maxValue;
    var xs = [];
    var qs = [];
    for (var i = 0; i <= nPoints; i++) {
      var v = minV + (maxV - minV) * (i / nPoints);
      var hr = getNormalizedFitnessHR(result.age, v, result.sex, 'central', metric);
      var q = result.qPop * hr * result.userRiskHR;
      xs.push(v);
      qs.push(q);
    }
    return { xs: xs, qs: qs, minV: minV, maxV: maxV };
  },

  renderCombined(result) {
    var metric = result.metric || 'vo2max';
    var info = getMetricInfo(metric);
    var sampled = this.sampleCurve(result, 400);
    var unit = this.getActiveUnit();
    var ys = sampled.qs.map(unit.transform);

    var heading = document.getElementById('chart-heading');
    if (heading) {
      heading.textContent = 'Mortality vs ' + info.label + ' \u2014 '
        + (result.sex === 'male' ? 'male' : 'female') + ', age ' + result.age;
    }
    var chartDesc = document.getElementById('chart-description');
    if (chartDesc) {
      chartDesc.textContent = 'Annual mortality as a function of ' + info.label
        + ' (continuous hazard model). Dashed teal line = your value.';
    }

    var userColor = this.getCurrentColor();
    var userValue = result.metricValue;

    var ctx = document.getElementById('combined-cdf-chart').getContext('2d');
    if (combinedChart) combinedChart.destroy();

    combinedChart = new Chart(ctx, {
      type: 'scatter',
      data: {
        datasets: [{
          label: unit.axisLabel,
          data: sampled.xs.map(function(x, i) { return { x: x, y: ys[i] }; }),
          borderColor: '#dc2635',
          backgroundColor: '#dc263520',
          borderWidth: 2,
          showLine: true,
          fill: false,
          tension: 0,
          pointRadius: 0,
          pointHoverRadius: 0,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: { top: 24, bottom: 0 } },
        interaction: { mode: 'nearest', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: function(c) {
                return c.raw.x.toFixed(1) + ' ' + info.unit + ': ' + unit.format(c.raw.y);
              }
            }
          },
          youAreHere: { value: userValue, color: userColor },
        },
        scales: {
          x: {
            type: 'linear',
            title: { display: true, text: info.label + ' (' + info.unit + ')', padding: { top: 2, bottom: 0 } },
            min: sampled.minV,
            max: sampled.maxV,
          },
          y: {
            type: 'linear',
            position: 'left',
            title: { display: true, text: unit.axisLabel, color: '#dc2635' },
            ticks: { color: '#dc2635' },
            min: 0,
            max: Math.max.apply(null, ys) * 1.1 || 1,
          },
        },
      },
      plugins: [{
        id: 'youAreHere',
        afterDraw: function(chart) {
          var opts = chart.options.plugins.youAreHere;
          if (opts == null || opts.value == null) return;
          var xScale = chart.scales.x;
          if (opts.value < xScale.min || opts.value > xScale.max) return;
          var xPixel = xScale.getPixelForValue(opts.value);
          var c = chart.ctx;
          c.save();
          c.beginPath();
          c.setLineDash([6, 4]);
          c.strokeStyle = opts.color || '#0ea5a4';
          c.lineWidth = 2;
          c.moveTo(xPixel, chart.chartArea.top);
          c.lineTo(xPixel, chart.chartArea.bottom);
          c.stroke();
          c.setLineDash([]);
          c.fillStyle = opts.color || '#0ea5a4';
          c.font = 'bold 11px sans-serif';
          c.textAlign = 'center';
          c.textBaseline = 'bottom';
          c.fillText('You (' + opts.value.toFixed(1) + ')', xPixel, chart.chartArea.top - 4);
          c.restore();
        }
      }]
    });
  }
};
