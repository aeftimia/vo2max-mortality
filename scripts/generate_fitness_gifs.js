// scripts/generate_fitness_gifs.js
// Fixed: metric variable scoping + robust dummy value + dynamic title with age/gender

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..');
const FRAMES_DIR = path.join(REPO_ROOT, 'gifs', 'frames');
const OUTPUT_DIR = path.join(REPO_ROOT, 'gifs');

async function generateGifs() {
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  if (!fs.existsSync(FRAMES_DIR)) fs.mkdirSync(FRAMES_DIR, { recursive: true });

  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 920 });

  console.log('Loading your site...');
  await page.goto(`file://${path.join(REPO_ROOT, 'index.html')}`, { waitUntil: 'networkidle0' });

  // Inject modified clean renderer (dynamic title + fixed scales + no "You" line)
  await page.evaluate(() => {
    if (typeof Charts === 'undefined' || typeof Chart === 'undefined') {
      console.warn('Charts or Chart.js not found on page');
      return;
    }

    const FIXED_SCALES = {
      vo2max: {
        male:   { yMetric: { min: 18, max: 68 }, yMort: { min: 0, max: 12 } },
        female: { yMetric: { min: 13, max: 58 }, yMort: { min: 0, max: 12 } },
      },
      grip: {
        male:   { yMetric: { min: 22, max: 68 }, yMort: { min: 0, max: 12 } },
        female: { yMetric: { min: 13, max: 48 }, yMort: { min: 0, max: 12 } },
      }
    };

    Charts.renderCombinedForGif = function(result) {
      const metricType = result.metric || 'vo2max';
      const sexLabel = (result.sex || 'male') === 'male' ? 'Male' : 'Female';
      const info = (typeof getMetricInfo === 'function') 
        ? getMetricInfo(metricType) 
        : { label: metricType.toUpperCase().replace('VO2MAX', 'VO₂ max'), unit: metricType.includes('vo2') ? 'mL/kg/min' : 'kg' };

      const sampled = (typeof Charts.sampleCurves === 'function') 
        ? Charts.sampleCurves(result, 500) 
        : { percentiles: Array.from({length: 101}, (_,i)=>i), metricValues: [], mortalities: [] };

      const ctx = document.getElementById('combined-cdf-chart')?.getContext('2d');
      if (!ctx) return;
      if (window.combinedChart) window.combinedChart.destroy();

      const scales = FIXED_SCALES[metricType]?.[result.sex] || { yMetric: { min: 0, max: 70 }, yMort: { min: 0, max: 12 } };

      window.combinedChart = new Chart(ctx, {
        type: 'scatter',
        data: {
          datasets: [
            {
              label: info.label,
              data: sampled.percentiles.map((p, i) => ({ x: p, y: sampled.metricValues[i] || 40 })),
              borderColor: '#7c3aed',
              borderWidth: 2.5,
              showLine: true,
              tension: 0.1,
              pointRadius: 0,
              yAxisID: 'yMetric',
            },
            {
              label: 'Annual mortality',
              data: sampled.percentiles.map((p, i) => ({ x: p, y: sampled.mortalities[i] || 1 })),
              borderColor: '#dc2635',
              borderWidth: 2.5,
              showLine: true,
              tension: 0.1,
              pointRadius: 0,
              yAxisID: 'yMort',
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          layout: { padding: { top: 40, bottom: 20, left: 15, right: 25 } },
          plugins: {
            legend: { display: false },
            title: {
              display: true,
              text: `${sexLabel}, Age ${result.age || 30}`,
              font: { size: 19, weight: '600' },
              padding: { top: 15, bottom: 25 },
              color: '#1f2937'
            },
            tooltip: {
              callbacks: {
                label: (ctx) => {
                  const p = Math.round(ctx.raw.x);
                  if (ctx.dataset.yAxisID === 'yMort') {
                    return `${p}th percentile: ${ctx.raw.y.toFixed(3)}% annual mortality`;
                  }
                  return `${p}th percentile: ${ctx.raw.y.toFixed(1)} ${info.unit || ''}`;
                }
              }
            }
          },
          scales: {
            x: { 
              title: { display: true, text: 'Fitness Percentile Rank' }, 
              min: 0, 
              max: 100, 
              ticks: { stepSize: 10 } 
            },
            yMetric: {
              position: 'left',
              title: { display: true, text: info.label + (info.unit ? ` (${info.unit})` : ''), color: '#7c3aed' },
              min: scales.yMetric.min,
              max: scales.yMetric.max,
              ticks: { color: '#7c3aed' }
            },
            yMort: {
              position: 'right',
              title: { display: true, text: 'Annual Mortality (%)', color: '#dc2635' },
              min: scales.yMort.min,
              max: scales.yMort.max,
              ticks: { color: '#dc2635' },
              grid: { drawOnChartArea: false }
            }
          }
        }
      });
    };

    // Override normal render
    if (typeof Charts.render === 'function') {
      Charts.render = Charts.renderCombinedForGif;
    }
  });

  console.log('Clean renderer injected (dynamic title showing age + gender)');

  const configs = [
    { sex: 'male',   metric: 'vo2max', label: 'men_vo2_max' },
    { sex: 'female', metric: 'vo2max', label: 'women_vo2_max' },
    { sex: 'male',   metric: 'grip',   label: 'men_grip_strength' },
    { sex: 'female', metric: 'grip',   label: 'women_grip_strength' },
  ];

  for (const { sex, metric, label } of configs) {
    console.log(`\n🎬 Generating ${label}.gif`);

    const ages = Array.from({ length: 73 }, (_, i) => 18 + i);
    const framePaths = [];

    for (let i = 0; i < ages.length; i++) {
      const age = ages[i];
      console.log(`   Frame ${i + 1}/${ages.length} — Age ${age}`);

      await page.evaluate((m, a, s) => {
        // Select metric tab
        const metricRadio = document.querySelector(`input[name="metric"][value="${m}"]`);
        if (metricRadio) metricRadio.click();

        // Set age
        const ageInput = document.getElementById('age');
        if (ageInput) {
          ageInput.value = a;
          ageInput.dispatchEvent(new Event('input', { bubbles: true }));
          ageInput.dispatchEvent(new Event('change', { bubbles: true }));
        }

        // Set sex
        const sexRadio = document.querySelector(`input[name="sex"][value="${s}"]`);
        if (sexRadio) sexRadio.click();

        // Dummy value (different for vo2 vs grip)
        const valInput = document.getElementById('metric-value') || 
                        document.querySelector('input[type="number"], input[placeholder*="e.g."]');
        if (valInput) {
          valInput.value = m.includes('vo2') ? '42' : '45';
        }
      }, metric, age, sex);

      await page.click('#calculate-btn');
      await new Promise(r => setTimeout(r, 280)); // extra time for title + chart

      const chartElement = await page.$('#combined-cdf-chart, .chart-container, canvas');
      const framePath = path.join(FRAMES_DIR, `${label}_age_${age}.png`);

      if (chartElement) {
        await chartElement.screenshot({ path: framePath });
      } else {
        await page.screenshot({ path: framePath, clip: { x: 40, y: 140, width: 1120, height: 680 } });
      }

      framePaths.push(framePath);
    }

    const outputGif = path.join(OUTPUT_DIR, `${label}.gif`);
    try {
      execSync(`gifski --fps 8 --quality 95 --output "${outputGif}" ${framePaths.join(' ')}`, { stdio: 'inherit' });
      console.log(`   ✅ Saved ${outputGif}`);
    } catch (e) {
      console.error('   gifski failed — run: brew install gifski');
    }
  }

  await browser.close();
  console.log('\n🎉 All GIFs generated! Titles now show "Male, Age XX" / "Female, Age XX" and age increases visibly.');
}

generateGifs().catch(console.error);
