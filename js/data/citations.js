/**
 * Centralized citation metadata — single source of truth for all study references.
 * Every URL, DOI, and bibliographic string used anywhere on the site should
 * reference this object rather than hardcoding values.
 */
const CITATIONS = {
  mandsager2018: { /* DEPRECATED: archival only */
    short: 'Mandsager 2018',
    full: 'Mandsager K, Harb S, Cremer P, Phelan D, Nissen SE, Jaber W. ' +
          'Association Between Cardiorespiratory Fitness and Long-term Mortality ' +
          'Among Adults Undergoing Exercise Treadmill Testing. ' +
          'JAMA Netw Open. 2018;1(6):e183605.',
    doi: '10.1001/jamanetworkopen.2018.3605',
    pmc: 'PMC6324439',
    url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC6324439/',
  },
  kokkinos2022: {
    short: 'Kokkinos 2022',
    full: 'Kokkinos P, et al. Cardiorespiratory Fitness and Mortality Risk Across the ' +
          'Spectra of Age, Race, and Sex. J Am Coll Cardiol. 2022;80(6):598–609.',
    doi: '10.1016/j.jacc.2022.05.031',
    url: 'https://www.jacc.org/doi/epdf/10.1016/j.jacc.2022.05.031'
  },
  friend2015: {
    short: 'FRIEND Registry',
    full: 'Kaminsky LA, Arena R, Beckie TM, et al. The Importance of ' +
          'Cardiorespiratory Fitness in the United States: The Need for a ' +
          'National Registry. Mayo Clin Proc. 2015;90(11):1515-1523.',
    pmc: 'PMC4919021',
    url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC4919021/',
  },
  friend2022: {
    short: 'FRIEND 2022',
    full: 'Kaminsky LA, et al. Updated Reference Standards for Cardiorespiratory ' +
          'Fitness Measured with Cardiopulmonary Exercise Testing: Data from the ' +
          'Fitness Registry and the Importance of Exercise National Database (FRIEND). ' +
          'Mayo Clin Proc. 2022;97(2):285–293.',
    doi: '10.1016/j.mayocp.2021.08.020',
    url: 'https://www.mayoclinicproceedings.org/article/S0025-6196(21)00682-3/fulltext',
  },
  ssaLifeTable: {
    short: 'SSA Period Life Table, 2022',
    full: 'Social Security Administration, Office of the Chief Actuary. ' +
          'Period Life Table, 2021.',
    url: 'https://www.ssa.gov/oact/STATS/table4c6.html',
  },
  nvss2022: {
    short: 'CDC NVSS Life Tables, 2022',
    full: 'Arias E, Xu JQ. United States Life Tables, 2022. National Vital ' +
          'Statistics Reports, Vol. 73, No. 12. Hyattsville, MD: NCHS. 2024.',
    url: 'https://www.cdc.gov/nchs/data/nvsr/nvsr73/nvsr73-12.pdf',
  },
  seshasai2011: {
    short: 'Seshasai 2011',
    full: 'Seshasai SR, Kaptoge S, Thompson A, et al. Diabetes Mellitus, ' +
          'Fasting Glucose, and Risk of Cause-Specific Death. ' +
          'N Engl J Med. 2011;364(9):829-841.',
    doi: '10.1056/NEJMoa1008862',
    url: 'https://doi.org/10.1056/NEJMoa1008862',
  },
  psc2002: {
    short: 'Prospective Studies Collaboration 2002',
    full: 'Prospective Studies Collaboration. Age-specific relevance of usual ' +
          'blood pressure to vascular mortality. Lancet. 2002;360(9349):1903-1913.',
    doi: '10.1016/S0140-6736(02)11911-8',
    url: 'https://doi.org/10.1016/S0140-6736(02)11911-8',
  },
  jha2013: {
    short: 'Jha 2013',
    full: 'Jha P, Ramasundarahettige C, Landsman V, et al. 21st-Century ' +
          'Hazards of Smoking and Benefits of Cessation in the United States. ' +
          'N Engl J Med. 2013;368(4):341-350.',
    doi: '10.1056/NEJMsa1211128',
    url: 'https://doi.org/10.1056/NEJMsa1211128',
  },
  berrington2010: {
    short: 'Berrington de Gonzalez 2010',
    full: 'Berrington de Gonzalez A, Hartge P, Cerhan JR, et al. Body-Mass ' +
          'Index and Mortality among 1.46 Million White Adults. ' +
          'N Engl J Med. 2010;363(23):2211-2219.',
    doi: '10.1056/NEJMoa1000367',
    url: 'https://doi.org/10.1056/NEJMoa1000367',
  },
  westman2008: {
    short: 'Westman 2008',
    full: 'Westman A, Rosén M, Berggren P, Björnstig U. Parachuting from ' +
          'fixed objects: descriptive study of 106 fatal events in BASE jumping ' +
          '1981-2006. Br J Sports Med. 2008;42(6):431-436.',
    doi: '10.1186/1757-7241-16-3',
    url: 'https://doi.org/10.1186/1757-7241-16-3',
  },
  braz2009: {
    short: 'Braz 2009',
    full: 'Braz LG, Módolo NS, do Nascimento P Jr, et al. Mortality in ' +
          'anesthesia: a systematic review. Clinics. 2009;64(10):999-1006.',
    pmc: 'PMC2763076',
    url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC2763076/',
  },
  uspa2023: {
    short: 'USPA 2023',
    full: 'United States Parachute Association. 2023 Fatality Summary.',
    url: 'https://uspa.org/a-widespread-improvementthe-2023-fatality-summary',
  },
  cooper1968: {
    short: 'Cooper 1968',
    full: 'Cooper KH. A means of assessing maximal oxygen intake. ' +
          'JAMA. 1968;203(3):201-204.',
    url: 'https://pubmed.ncbi.nlm.nih.gov/5694044/',
  },
  kline1987: {
    short: 'Kline 1987',
    full: 'Kline GM, Porcari JP, Hintermeister R, et al. Estimation of ' +
          'VO2max from a one-mile track walk, gender, age, and body weight. ' +
          'Med Sci Sports Exerc. 1987;19(3):253-259.',
    url: 'https://pubmed.ncbi.nlm.nih.gov/3600239/',
  },
  cpet2010: {
    short: 'AHA CPET Statement 2010',
    full: 'Balady GJ, Arena R, Sietsema K, et al. Clinician\'s Guide to ' +
          'Cardiopulmonary Exercise Testing in Adults: AHA Scientific Statement. ' +
          'Circulation. 2010;122(2):191-225.',
    doi: '10.1161/CIR.0000000000000973',
    url: 'https://doi.org/10.1161/CIR.0000000000000973',
  },
  smartwatch2023: {
    short: 'Smartwatch VO2max validation',
    full: 'Carrier B, Barrios B, Jolley BD, Navalta JW. Validity and ' +
          'Reliability of Physiological Data in Applied Settings Measured by ' +
          'Wearable Technology: A Rapid Systematic Review. Technologies. 2020;8(4):70.',
    doi: '10.3390/technologies8040070',
    url: 'https://doi.org/10.3390/technologies8040070',
  },
};

/**
 * Generate an HTML <a> tag for a citation.
 * @param {string} key  Citation key in CITATIONS object
 * @param {string} [text]  Link text (defaults to citation's short name)
 * @returns {string} HTML anchor string
 */
function citeLink(key, text) {
  const c = CITATIONS[key];
  if (!c) return text || key;
  return `<a href="${c.url}" target="_blank" rel="noopener">${text || c.short}</a>`;
}

/**
 * Generate a full bibliographic reference with linked DOI/PMC.
 * @param {string} key
 * @returns {string} HTML string
 */
function citeRef(key) {
  const c = CITATIONS[key];
  if (!c) return key;
  let ref = c.full;
  if (c.doi) ref += ` doi:${c.doi}`;
  if (c.pmc) ref += ` <a href="${c.url}" target="_blank" rel="noopener">${c.pmc}</a>.`;
  else if (c.url && c.doi) ref = ref.replace(`doi:${c.doi}`,
    `<a href="${c.url}" target="_blank" rel="noopener">doi:${c.doi}</a>`);
  else if (c.url) ref += ` <a href="${c.url}" target="_blank" rel="noopener">${c.url}</a>`;
  return ref;
}
