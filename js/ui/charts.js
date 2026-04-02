/**
 * Chart rendering using Chart.js showing cumulative distributions.
 * Displays two CDFs: VO₂ max and annual mortality, with user position and population baseline.
 * Dependency: Chart.js loaded via CDN before this file.
 */

let vo2Chart = null;
let mortalityChart = null;

const Charts = {
  getCurrentColor() { return getComputedStyle(document.documentElement).getPropertyValue('--c-current').trim() || '#0ea5a4'; },
  getPopColor() { return '#64748b'; },

  render(result) {
    this.renderVo2CDF(result);
    this.renderMortalityCDF(result);
  },

  /**
   * Render VO₂ max CDF: percentile (X) vs VO₂ (Y)
   * Shows user's position and population median (50th percentile)
   */
  renderVo2CDF(result) {
    // Generate CDF points: percentiles 1-100
    const percentiles = Array.from({length: 100}, (_, i) => i + 1);
    const vo2Values = percentiles.map(p => getVo2FromPercentile(result.age, p, result.sex));

    // User position
    const userVo2 = result.vo2Max;
    const userPercentile = result.friendPercentile;

    // Population median (50th percentile)
    const medianVo2 = getVo2FromPercentile(result.age, 50, result.sex);

    const ctx = document.getElementById('vo2-cdf-chart').getContext('2d');
    if (vo2Chart) vo2Chart.destroy();

    vo2Chart = new Chart(ctx, {
      type: 'scatter',
      data: {
        datasets: [
          {
            label: `VO₂ max distribution (${result.sex === 'male' ? 'male' : 'female'}, age ${result.age})`,
            data: percentiles.map((p, i) => ({ x: p, y: vo2Values[i] })),
            borderColor: '#7c3aed88',
            backgroundColor: '#7c3aed20',
            borderWidth: 2,
            showLine: true,
            fill: false,
            tension: 0.1,
            pointRadius: 0,
            pointHoverRadius: 6,
          },
          {
            label: 'Your VO₂ max',
            data: [{ x: userPercentile, y: userVo2 }],
            backgroundColor: this.getCurrentColor(),
            borderColor: this.getCurrentColor(),
            pointRadius: 8,
            pointBorderWidth: 2,
            pointBorderColor: '#fff',
            showLine: false,
          },
          {
            label: 'Population median (50th percentile)',
            data: [{ x: 50, y: medianVo2 }],
            backgroundColor: this.getPopColor(),
            borderColor: this.getPopColor(),
            pointRadius: 6,
            pointBorderWidth: 2,
            pointBorderColor: '#fff',
            pointStyle: 'triangle',
            showLine: false,
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: true, position: 'top' },
          tooltip: {
            callbacks: {
              label(ctx) {
                const p = ctx.raw.x;
                const vo2 = ctx.raw.y.toFixed(2);
                return `${p}th percentile: ${vo2} mL/kg/min`;
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
          y: {
            title: { display: true, text: 'VO₂ max (mL/kg/min)' },
            min: 8,
            max: Math.max(...vo2Values) + 2
          }
        }
      }
    });
  },

  /**
   * Render mortality CDF: percentile (X) vs annual mortality (Y)
   * Shows user's mortality and population baseline (50th percentile)
   */
  renderMortalityCDF(result) {
    // Generate mortality CDF points across percentiles
    const percentiles = Array.from({length: 100}, (_, i) => i + 1);
    const mortalities = percentiles.map(p => {
      const vo2 = getVo2FromPercentile(result.age, p, result.sex);
      const hr = getNormalizedFitnessHR(result.age, vo2, result.sex);
      const q = result.qPop * hr * result.userRiskHR;
      return q * 100; // percent
    });

    // User position
    const userPercentile = result.friendPercentile;
    const userMortality = result.qUser * 100;

    // Population baseline (50th percentile, normalized HR = 1.0)
    const popMortality = result.qPop * 100;
    const medianVo2 = getVo2FromPercentile(result.age, 50, result.sex);
    const medianHR = getNormalizedFitnessHR(result.age, medianVo2, result.sex);
    const medianMortality = result.qPop * medianHR * result.userRiskHR * 100;

    const ctx = document.getElementById('mortality-cdf-chart').getContext('2d');
    if (mortalityChart) mortalityChart.destroy();

    mortalityChart = new Chart(ctx, {
      type: 'scatter',
      data: {
        datasets: [
          {
            label: `Annual mortality distribution (${result.sex === 'male' ? 'male' : 'female'}, age ${result.age})`,
            data: percentiles.map((p, i) => ({ x: p, y: mortalities[i] })),
            borderColor: '#dc263588',
            backgroundColor: '#dc263520',
            borderWidth: 2,
            showLine: true,
            fill: false,
            tension: 0.1,
            pointRadius: 0,
            pointHoverRadius: 6,
          },
          {
            label: 'Your mortality',
            data: [{ x: userPercentile, y: userMortality }],
            backgroundColor: this.getCurrentColor(),
            borderColor: this.getCurrentColor(),
            pointRadius: 8,
            pointBorderWidth: 2,
            pointBorderColor: '#fff',
            showLine: false,
          },
          {
            label: 'Population baseline (50th percentile)',
            data: [{ x: 50, y: medianMortality }],
            backgroundColor: this.getPopColor(),
            borderColor: this.getPopColor(),
            pointRadius: 6,
            pointBorderWidth: 2,
            pointBorderColor: '#fff',
            pointStyle: 'triangle',
            showLine: false,
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: true, position: 'top' },
          tooltip: {
            callbacks: {
              label(ctx) {
                const p = ctx.raw.x;
                const mort = ctx.raw.y.toFixed(5);
                return `${p}th percentile: ${mort}%`;
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
          y: {
            title: { display: true, text: 'Annual mortality probability (%)' },
            min: 0,
            max: Math.max(...mortalities) * 1.1
          }
        }
      }
    });
  }
};
