/**
 * Form handling — reads inputs, validates, triggers computation.
 */

const Form = {
  getInputs() {
    const age    = parseInt(document.getElementById('age').value, 10);
    const sex    = document.querySelector('input[name="sex"]:checked')?.value;
    const vo2max = parseFloat(document.getElementById('vo2max').value);

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
    // Remove lower classes if higher is selected
    const cleanedRF = riskFactors.filter(id => {
      if (id.startsWith('obesity_') && id !== obesitySelected) return false;
      return true;
    });

    // Mutually exclusive smoking — current overrides former
    if (cleanedRF.includes('smoking_current') && cleanedRF.includes('smoking_former')) {
      cleanedRF.splice(cleanedRF.indexOf('smoking_former'), 1);
    }

    return { age, sex, vo2max, riskFactors: cleanedRF };
  },

  validate(inputs) {
    const errors = [];
    const { age, sex, vo2max } = inputs;

    if (isNaN(age) || age < 18 || age > 90) {
      errors.push('Age must be between 18 and 90.');
    }
    if (!sex) {
      errors.push('Please select a sex.');
    }
    if (isNaN(vo2max) || vo2max < 5 || vo2max > 100) {
      errors.push('VO₂ max must be between 5 and 100 mL/kg/min.');
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
      <li><strong>Smartwatch estimate:</strong> Many Garmin, Apple Watch, and Polar devices estimate VO₂ max from heart rate during runs. These are typically within ${citeLink('smartwatch2023', '±5 mL/kg/min')}.</li>
      <li><strong>${citeLink('cooper1968', 'Cooper 12-minute run test')}:</strong> VO₂ max ≈ (distance in meters − 504.9) / 44.73. Run as far as you can in 12 minutes on a flat surface.</li>
      <li><strong>${citeLink('kline1987', 'Rockport 1-mile walk test')}:</strong> Walk 1 mile as fast as possible; use published formula with finish time, heart rate, age, sex, and weight.</li>
      <li><strong>Clinical exercise test (gold standard):</strong> VO₂ max measured directly via ${citeLink('cpet2010', 'cardiopulmonary exercise testing (CPET)')} in a sports medicine lab or cardiologist's office.</li>
    `;
  },

  updateVO2Placeholder() {
    var ageEl = document.getElementById('age');
    var sexEl = document.querySelector('input[name="sex"]:checked');
    var vo2El = document.getElementById('vo2max');
    var age = parseInt(ageEl.value, 10);
    var sex = sexEl ? sexEl.value : null;
    if (!age || age < 20 || age > 89 || !sex) {
      vo2El.placeholder = 'e.g. 35';
      return;
    }
    try {
      var median = getVo2FromPercentile(age, 50, sex);
      vo2El.placeholder = 'e.g. ' + median.toFixed(1);
    } catch (e) {
      vo2El.placeholder = 'e.g. 35';
    }
  },

  init() {
    this.buildCheckboxes();
    this.buildVO2Methods();

    document.getElementById('calculate-btn').addEventListener('click', () => this.onSubmit());
    document.getElementById('calculate-form').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.onSubmit();
    });

    // Update VO₂ max placeholder with median when age/sex change
    document.getElementById('age').addEventListener('input', () => this.updateVO2Placeholder());
    document.querySelectorAll('input[name="sex"]').forEach(r => {
      r.addEventListener('change', () => this.updateVO2Placeholder());
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
  },
};
