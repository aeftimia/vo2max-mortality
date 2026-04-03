/**
 * Form handling — reads inputs, validates, triggers computation.
 */

const Form = {
  getInputs() {
    const metric = getCurrentMetric();
    const age    = parseInt(document.getElementById('age').value, 10);
    const sex    = document.querySelector('input[name="sex"]:checked')?.value;
    const metricValue = parseFloat(document.getElementById('metric-value').value);

    const riskFactors = [];
    document.querySelectorAll('.risk-factor-cb:checked').forEach(cb => {
      riskFactors.push(cb.value);
    });

    // Mutually exclusive obesity classes — only keep the highest selected
    const obesityClasses = ['obesity_3', 'obesity_2', 'obesity_1'];
    let obesitySelected = null;
    for (const oc of obesityClasses) {
      if (riskFactors.includes(oc)) { obesitySelected = oc; break; }
    }
    const cleanedRF = riskFactors.filter(id => {
      if (id.startsWith('obesity_') && id !== obesitySelected) return false;
      return true;
    });

    // Mutually exclusive smoking — current overrides former
    if (cleanedRF.includes('smoking_current') && cleanedRF.includes('smoking_former')) {
      cleanedRF.splice(cleanedRF.indexOf('smoking_former'), 1);
    }

    return { age, sex, metricValue, metric, riskFactors: cleanedRF };
  },

  validate(inputs) {
    const errors = [];
    const { age, sex, metricValue, metric } = inputs;
    const info = getMetricInfo(metric);

    if (isNaN(age) || age < 18 || age > 90) {
      errors.push('Age must be between 18 and 90.');
    }
    if (!sex) {
      errors.push('Please select a sex.');
    }
    if (isNaN(metricValue) || metricValue < info.minValue || metricValue > info.maxValue) {
      errors.push(info.label + ' must be between ' + info.minValue + ' and ' + info.maxValue + ' ' + info.unit + '.');
    }
    return errors;
  },

  showErrors(errors) {
    const el = document.getElementById('form-errors');
    if (errors.length === 0) {
      el.textContent = '';
      el.style.display = 'none';
      return;
    }
    el.innerHTML = errors.map(e => `<li>${e}</li>`).join('');
    el.style.display = 'block';
  },

  onSubmit() {
    const inputs  = this.getInputs();
    const errors  = this.validate(inputs);
    this.showErrors(errors);
    if (errors.length > 0) return;

    try {
      const result = computeMortality(inputs);
      Results.render(result);
    } catch (e) {
      this.showErrors(['Calculation error: ' + e.message]);
      console.error('computeMortality failed:', e);
      return;
    }

    document.getElementById('results-section').style.display = 'block';
    document.getElementById('results-section').scrollIntoView({ behavior: 'smooth' });
  },

  buildCheckboxes() {
    const container = document.getElementById('risk-factor-checkboxes');
    if (!container) return;
    container.innerHTML = '';
    for (const rf of RISK_FACTORS) {
      const cite = CITATIONS[rf.cite];
      const studyLink = cite
        ? ` <a href="${cite.url}" target="_blank" rel="noopener" class="small muted">[study]</a>`
        : '';
      const label = document.createElement('label');
      label.innerHTML =
        `<input type="checkbox" class="risk-factor-cb" id="cb-${rf.id}" value="${rf.id}"> ` +
        rf.label + studyLink;
      container.appendChild(label);
    }
  },

  buildVO2Methods() {
    const container = document.getElementById('vo2-methods-list');
    if (!container) return;
    container.innerHTML = `
      <li><strong>Smartwatch estimate:</strong> Many Garmin, Apple Watch, and Polar devices estimate VO\u2082 max from heart rate during runs. These are typically within ${citeLink('smartwatch2023', '\u00b15 mL/kg/min')}.</li>
      <li><strong>${citeLink('cooper1968', 'Cooper 12-minute run test')}:</strong> VO\u2082 max \u2248 (distance in meters \u2212 504.9) / 44.73. Run as far as you can in 12 minutes on a flat surface.</li>
      <li><strong>${citeLink('kline1987', 'Rockport 1-mile walk test')}:</strong> Walk 1 mile as fast as possible; use published formula with finish time, heart rate, age, sex, and weight.</li>
      <li><strong>Clinical exercise test (gold standard):</strong> VO\u2082 max measured directly via ${citeLink('cpet2010', 'cardiopulmonary exercise testing (CPET)')} in a sports medicine lab or cardiologist\u2019s office.</li>
    `;
  },

  buildGripMethods() {
    const container = document.getElementById('grip-methods-list');
    if (!container) return;
    container.innerHTML = `
      <li><strong>Hand dynamometer:</strong> Squeeze a calibrated hand dynamometer (e.g., Jamar) as hard as possible with your dominant hand. Best of 2\u20133 attempts. Many gyms and physiotherapy clinics have these.</li>
      <li><strong>Bathroom scale method:</strong> Place a bathroom scale on a table edge and squeeze with one hand. Not calibrated but gives a rough estimate.</li>
      <li><strong>Clinical assessment:</strong> Grip strength is routinely measured in geriatric assessments and sports medicine evaluations.</li>
    `;
  },

  /** Update metric input label, placeholder, and measurement methods based on selected metric. */
  updateMetricUI() {
    const metric = getCurrentMetric();
    const info = getMetricInfo(metric);
    const label = document.getElementById('metric-label');
    const input = document.getElementById('metric-value');
    const vo2Methods = document.getElementById('vo2-methods-container');
    const gripMethods = document.getElementById('grip-methods-container');

    if (label) label.textContent = info.inputLabel;
    if (input) {
      input.min = info.minValue;
      input.max = info.maxValue;
      input.value = '';
    }

    // Toggle method sections
    if (vo2Methods) vo2Methods.style.display = metric === 'vo2max' ? '' : 'none';
    if (gripMethods) gripMethods.style.display = metric === 'grip' ? '' : 'none';

    this.updatePlaceholder();

    // Hide results when switching metrics
    var results = document.getElementById('results-section');
    if (results) results.style.display = 'none';
  },

  updatePlaceholder() {
    const metric = getCurrentMetric();
    const info = getMetricInfo(metric);
    const ageEl = document.getElementById('age');
    const sexEl = document.querySelector('input[name="sex"]:checked');
    const input = document.getElementById('metric-value');
    const age = parseInt(ageEl.value, 10);
    const sex = sexEl ? sexEl.value : null;

    if (!age || age < info.minAge || age > info.maxAge || !sex) {
      input.placeholder = info.placeholder;
      return;
    }
    try {
      var median = getMetricFromPercentile(age, 50, sex, metric);
      input.placeholder = 'e.g. ' + median.toFixed(1);
    } catch (e) {
      input.placeholder = info.placeholder;
    }
  },

  init() {
    this.buildCheckboxes();
    this.buildVO2Methods();
    this.buildGripMethods();

    document.getElementById('calculate-btn').addEventListener('click', () => this.onSubmit());
    document.getElementById('calculate-form').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.onSubmit();
    });

    // Metric toggle
    document.querySelectorAll('input[name="metric"]').forEach(r => {
      r.addEventListener('change', () => this.updateMetricUI());
    });

    // Update placeholder when age/sex change
    document.getElementById('age').addEventListener('input', () => this.updatePlaceholder());
    document.querySelectorAll('input[name="sex"]').forEach(r => {
      r.addEventListener('change', () => this.updatePlaceholder());
    });

    // Toggle smoking: disable former if current selected and vice versa
    const curCb  = document.getElementById('cb-smoking_current');
    const frmCb  = document.getElementById('cb-smoking_former');
    if (curCb && frmCb) {
      curCb.addEventListener('change', () => { if (curCb.checked) frmCb.checked = false; });
      frmCb.addEventListener('change', () => { if (frmCb.checked) curCb.checked = false; });
    }

    // Obesity: selecting a higher class unchecks lower ones
    ['obesity_1', 'obesity_2', 'obesity_3'].forEach(id => {
      const cb = document.getElementById('cb-' + id);
      if (!cb) return;
      cb.addEventListener('change', () => {
        if (cb.checked) {
          ['obesity_1', 'obesity_2', 'obesity_3'].forEach(other => {
            if (other !== id) {
              const o = document.getElementById('cb-' + other);
              if (o) o.checked = false;
            }
          });
        }
      });
    });

    // Initialize metric UI state
    this.updateMetricUI();
  },
};
