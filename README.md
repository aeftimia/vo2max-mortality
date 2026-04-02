# VO₂ Max Mortality Calculator

An open-source static website that estimates how cardiorespiratory fitness (VO₂ max) affects all-cause mortality risk, and expresses the difference in intuitive units like base jumps, skydives, and CT scans per year.

**[Live demo →](https://aeftimia.github.io/vo2max-mortality)**

## What it does

Given your age, sex, VO₂ max, and any relevant health conditions, the calculator:

1. Classifies your fitness level using FRIEND 2022 percentile norms and estimates mortality using a continuous FRIEND+Kokkinos model (FRIEND 2022 percentiles + Kokkinos 2022 HR = 0.86 per +1 MET).
2. Anchors population-average mortality to the SSA period life tables via an integral normalization so the expected fitness hazard equals 1.0.
3. Adjusts for health conditions using HRs from large published studies
4. Shows excess mortality from moving between fitness percentiles or deciles, expressed as equivalent annual risky activities

## Key data sources

| Source | Used for |
|--------|----------|
| Mandsager et al. 2018 (JAMA Network Open) | Hazard ratios & VO₂ max category boundaries |
| SSA Period Life Table 2021 | Population baseline mortality |
| FRIEND Registry (Mayo Clin Proc 2015) | Peer comparison percentiles (display only) |
| Multiple large cohort studies | Risk factor hazard ratios |

See [methodology.html](methodology.html) for the full mathematical derivation, all citations, and limitations.

## Math in brief

```
W       = Σ(f_i × HR_i)          # population-weighted HR ≈ 0.601
q_Low   = q_SSA(age, sex) / W    # back-calculate Low fitness mortality
q_i     = q_Low × HR_i           # mortality for each fitness category
q_user  = q_i × Π(HR_comorbidities)
Δq      = q_user[target] − q_user[current]
N_base_jumps = Δq × 2317         # 1 base jump ≈ 0.043% mortality risk
```

## Technical

- Pure static site: HTML + CSS + vanilla JavaScript, no framework, no build step
- All computation client-side
- Works from `file://` (open `index.html` directly) or any static host
- Chart.js loaded from CDN (pinned version with SRI hash)
- Debug/unit tests: open `index.html?debug=1` and check the browser console

## Verification

Open `index.html?debug=1` in a browser. The test suite runs automatically and reports results in the browser console. All tests should pass before contributing changes.

Key sanity checks:
- `q_Low > q_pop > q_Elite` at every age
- HR ratios preserved in derived mortality values
- 30-year-old male with VO₂ max 45 → Above Average, ~0.13%/yr

## Contributing

Contributions welcome, especially:
- Replacing the interpolated SSA life table with exact integer-age values from the published table
- Adding additional well-cited risk factors (with source)
- Improving VO₂ max boundary data if Mandsager Table 1 values can be verified more precisely
- Translations and accessibility improvements

Please open an issue before submitting large changes. All data values must be traceable to a published source with a DOI or URL.

## Limitations

This tool is for educational purposes only. See [methodology.html](methodology.html) for a full list of assumptions and limitations. Key caveats:

- Mandsager cohort is a clinical referral population, not a general population sample
- HRs are observational — causality is not established
- Risk factors applied multiplicatively (independence assumption)
- Not medical advice

## License

MIT. Data sources are public domain (SSA) or used per their respective licenses for educational purposes with attribution.
