(function() {
  // Declare on window immediately so loader can populate it before model script loads
  if (!window.FRIEND_2022_CONTINUOUS) {
    window.FRIEND_2022_CONTINUOUS = {};
  }

  const dataUrl = 'js/data/friend-2022-continuous.json';
  
  function handleData(data) {
    Object.assign(window.FRIEND_2022_CONTINUOUS, data);
    console.log('✓ FRIEND 2022 continuous model data loaded');
    console.log('  Metadata:', data.metadata);
    console.log('  Sexes:', Object.keys(data.grids || {}));
  }

  function buildSyntheticFRIEND() {
    console.log('Building synthetic FRIEND-like model for offline/file:// use...');
    const sexes = ['male','female'];
    const grids = { male: {}, female: {} };
    const normalization = { male: {}, female: {} };

    // Simple synthetic percentile grids: percentiles 1..99, ages 20..89
    for (const sex of sexes) {
      for (let age = 20; age <= 89; age++) {
        // median VO2 decreases modestly with age
        const median = (sex === 'male' ? 46 : 36) - 0.12 * (age - 20);
        const spread = (sex === 'male' ? 18 : 16); // approx distance between p1 and p99
        const pmap = {};
        for (let p = 1; p <= 99; p++) {
          // linear percentile mapping around median
          const vo2 = median + ((p - 50) / 49) * (spread / 2);
          pmap[p] = Math.round(vo2 * 100) / 100;
        }
        grids[sex][age] = pmap;

        // compute normalization k so expected HR over percentiles is 1.0
        // approximate integral by averaging p=1..99
        let acc = 0;
        for (let p = 1; p <= 99; p++) {
          const vo2 = pmap[p];
          const MET = vo2 / 3.5;
          acc += Math.pow(0.86, MET);
        }
        const avg = acc / 99;
        normalization[sex][age + 0.0] = 1.0 / avg;
      }
    }

    const synthetic = {
      metadata: { 
        model: 'synthetic_fallback', 
        note: 'Lightweight synthetic FRIEND-like model for offline/file:// testing. For production use, run a local HTTP server (python -m http.server) or deploy via http(s).' 
      },
      normalization,
      grids,
    };

    handleData(synthetic);
  }

  // Detect if running on file:// protocol
  const isFileProtocol = window.location.protocol === 'file:';

  if (isFileProtocol) {
    // Skip fetch entirely on file://; use synthetic or embedded data
    console.log('File protocol detected; skipping fetch. Using embedded or synthetic FRIEND model.');
    if (window.FRIEND_2022_EMBED) {
      console.log('Using FRIEND_2022_EMBED from index.html');
      handleData(window.FRIEND_2022_EMBED);
    } else {
      buildSyntheticFRIEND();
    }
    return;
  }

  // On http(s), attempt fetch
  fetch(dataUrl).then(response => {
    if (!response.ok) throw new Error(`Failed to load FRIEND 2022 data: ${response.statusText}`);
    return response.json();
  }).then(handleData).catch(error => {
    console.warn('Fetch failed on http(s); falling back to synthetic model. Error:', error.message);
    buildSyntheticFRIEND();
  });
})();
