/**
 * Number formatting utilities for display.
 */

/**
 * Format an annual mortality probability as a percentage string.
 * e.g. 0.001234 → "0.123%"
 * Chooses appropriate decimal places based on magnitude.
 */
function fmtPercent(q) {
  const pct = q * 100;
  if (pct >= 10)   return pct.toFixed(1) + '%';
  if (pct >= 1)    return pct.toFixed(2) + '%';
  if (pct >= 0.1)  return pct.toFixed(3) + '%';
  return pct.toFixed(4) + '%';
}

/**
 * Format a delta q (excess mortality) as a signed percent.
 */
function fmtDeltaPercent(dq) {
  const prefix = dq >= 0 ? '+' : '';
  return prefix + fmtPercent(Math.abs(dq)).replace('%', '') +
         (dq >= 0 ? '%' : '%');
}

/**
 * Format a number of risk equivalents.
 * e.g. 1.8 → "1.8", 0.15 → "0.15", 1234 → "1,234"
 */
function fmtEquiv(n) {
  const absN = Math.abs(n);
  if (absN < 0.01) return '<0.01';
  if (absN < 10)   return absN.toFixed(1);
  if (absN < 100)  return absN.toFixed(0);
  return Math.round(absN).toLocaleString();
}

/**
 * Format life expectancy delta in years with +/- sign (no sign when exactly 0).
 */
function fmtYears(dy) {
  const absY = Math.abs(dy);
  const sign = dy > 0 ? '+' : dy < 0 ? '−' : '';
  if (absY < 0.1) {
    const absMonths = (absY * 12).toFixed(1);
    return sign + absMonths + ' months';
  }
  return sign + absY.toFixed(1) + ' year' + (absY !== 1 ? 's' : '');
}

/**
 * Format absolute life expectancy in years (no sign).
 */
function fmtAbsYears(y) {
  if (y < 0.1) return (y * 12).toFixed(1) + ' months';
  return y.toFixed(1);
}

/**
 * Human-readable label for a category.
 */
const CAT_LABEL = {
  Low:      'Low',
  BelowAvg: 'Below Average',
  AboveAvg: 'Above Average',
  High:     'High',
  Elite:    'Elite',
};

/**
 * Return a sentence describing the direction of a fitness change.
 * e.g. "Moving from Above Average to Elite..."
 */
function fmtTransitionVerb(dq) {
  return dq < 0 ? 'save' : 'cost';
}
