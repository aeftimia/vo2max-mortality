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
    console.log('  Sexes:', Object.keys(data.percentile_splines || data.grids || {}));
  }

  function buildSyntheticFRIEND() {
    console.log('Building synthetic FRIEND-like model for offline/file:// use...');
    var sexes = ['male','female'];
    var normalization = { male: {}, female: {} };
    var percentile_splines = { male: {}, female: {} };

    for (var s = 0; s < sexes.length; s++) {
      var sex = sexes[s];
      for (var age = 20; age <= 89; age++) {
        // Simple linear percentile model for fallback
        var median = (sex === 'male' ? 46 : 36) - 0.12 * (age - 20);
        var spread = (sex === 'male' ? 18 : 16);
        var p10 = median - spread / 2;
        var p90 = median + spread / 2;

        // Build a 2-piece linear spline [10, 50, 90]
        var knots = [10, 50, 90];
        var values = [p10, median, p90];
        var coeffs = [];
        for (var i = 0; i < knots.length - 1; i++) {
          var h = knots[i + 1] - knots[i];
          var slope = (values[i + 1] - values[i]) / h;
          coeffs.push([0.0, slope, values[i]]);
        }
        percentile_splines[sex][String(age)] = {
          knots: knots,
          coeffs: coeffs,
          values: values,
        };

        // Approximate normalization
        var acc = 0;
        for (var p = 1; p <= 99; p++) {
          var frac = (p - 10) / 80;
          frac = Math.max(0, Math.min(1, frac));
          var vo2 = p10 + frac * (p90 - p10);
          acc += Math.pow(0.86, vo2 / 3.5);
        }
        var avg = acc / 99;
        normalization[sex][String(age)] = {
          k: 1.0 / avg,
          k_lo: 1.0 / avg,  // approximate
          k_hi: 1.0 / avg,
        };
      }
    }

    var synthetic = {
      metadata: {
        model: 'synthetic_fallback',
        note: 'Lightweight synthetic FRIEND-like model for offline/file:// testing. For production use, run a local HTTP server (python -m http.server) or deploy via http(s).'
      },
      normalization: normalization,
      percentile_splines: percentile_splines,
    };

    handleData(synthetic);
  }

  // Detect if running on file:// protocol
  var isFileProtocol = window.location.protocol === 'file:';

  if (isFileProtocol) {
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
  fetch(dataUrl).then(function(response) {
    if (!response.ok) throw new Error('Failed to load FRIEND 2022 data: ' + response.statusText);
    return response.json();
  }).then(handleData).catch(function(error) {
    console.warn('Fetch failed on http(s); falling back to synthetic model. Error:', error.message);
    buildSyntheticFRIEND();
  });
})();
