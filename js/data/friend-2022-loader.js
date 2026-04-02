/**
 * Loader for FRIEND 2022 Continuous Model Data
 * 
 * Fetches and initializes the continuous VO2 fitness model data
 * from friend-2022-continuous.json.
 * 
 * This file must be loaded before friend-2022-continuous-model.js
 * and the main engine.js.
 */

(function() {
  const dataUrl = 'js/data/friend-2022-continuous.json';
  
  // Load JSON via fetch (with fallback for old browsers)
  // For file:// testing, use synchronous injection if the JSON is present as a local script.
  function handleData(data) {
    Object.assign(FRIEND_2022_CONTINUOUS, data);
    console.log('✓ FRIEND 2022 continuous model data loaded');
    console.log('  Metadata:', data.metadata);
    console.log('  Sexes:', Object.keys(data.grids || {}));
  }

  // Attempt fetch; if blocked (file://), fall back to requiring the JSON as a script
  fetch(dataUrl).then(response => {
    if (!response.ok) throw new Error(`Failed to load FRIEND 2022 data: ${response.statusText}`);
    return response.json();
  }).then(handleData).catch(error => {
    console.warn('Fetch failed; attempting fallback to inline script. Error:', error.message);
    // If a global FRIEND_2022_EMBED exists (inlined JSON), use it
    if (window.FRIEND_2022_EMBED) {
      try { handleData(window.FRIEND_2022_EMBED); return; } catch (e) { /* continue to error */ }
    }
    console.error('Error loading FRIEND 2022 continuous model:', error);
    FRIEND_2022_CONTINUOUS.metadata = { model: 'error', error: error.message };
  });
})();
