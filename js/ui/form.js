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

    const result = computeMortality(inputs);
    Results.render(result);

    document.getElementById('results-section').style.display = 'block';
    document.getElementById('results-section').scrollIntoView({ behavior: 'smooth' });
  },

  init() {
    document.getElementById('calculate-btn').addEventListener('click', () => this.onSubmit());
    document.getElementById('calculate-form').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.onSubmit();
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
