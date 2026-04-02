// FRIEND 2022 continuous model data is loaded directly via
// friend-2022-continuous-data.js (synchronous script tag).
// No fetch, no synthetic fallback — if the data is missing, errors surface immediately.

(function() {
  if (!window.FRIEND_2022_CONTINUOUS ||
      !window.FRIEND_2022_CONTINUOUS.percentile_splines ||
      !window.FRIEND_2022_CONTINUOUS.normalization) {
    throw new Error(
      'FRIEND 2022 continuous model data not found. ' +
      'Ensure friend-2022-continuous-data.js is loaded before this script.'
    );
  }
  console.log('✓ FRIEND 2022 continuous model data verified');
  console.log('  Model:', window.FRIEND_2022_CONTINUOUS.metadata.model);
})();
