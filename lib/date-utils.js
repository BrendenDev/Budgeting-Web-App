/**
 * Timezone-aware date utilities.
 * Uses the browser's system timezone automatically.
 * All date-only operations (no time component) should use these helpers
 * to avoid UTC midnight boundary issues.
 */

const TIMEZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;

/**
 * Get today's date string (YYYY-MM-DD) in Mountain Time.
 */
export function getTodayMT() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE }).format(new Date());
}

/**
 * Get current year in Mountain Time.
 */
export function getCurrentYearMT() {
  return Number(new Intl.DateTimeFormat('en-US', { timeZone: TIMEZONE, year: 'numeric' }).format(new Date()));
}

/**
 * Get current month (0-indexed) in Mountain Time.
 */
export function getCurrentMonthMT() {
  return Number(new Intl.DateTimeFormat('en-US', { timeZone: TIMEZONE, month: 'numeric' }).format(new Date())) - 1;
}

/**
 * Parse a date string (YYYY-MM-DD) or Date object into a
 * timezone-safe "noon UTC" Date.  This avoids off-by-one errors
 * because noon UTC is always the same calendar date in any US timezone.
 */
export function parseDateSafe(dateInput) {
  if (!dateInput) return null;
  let str;
  if (typeof dateInput === 'string') {
    str = dateInput.split('T')[0]; // strip any time portion
  } else if (dateInput instanceof Date) {
    // Format in user's timezone to get the intended calendar date
    str = new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE }).format(dateInput);
  } else {
    return null;
  }
  // Parse as noon UTC to avoid boundary issues
  const [y, m, d] = str.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
}

/**
 * Format a Date or date-string into YYYY-MM-DD using the system timezone.
 * Strings are routed through parseDateSafe first (noon UTC) to avoid
 * the midnight-UTC-to-previous-day shift.
 */
export function toDateStringMT(dateInput) {
  if (!dateInput) return '';
  const d = typeof dateInput === 'string'
    ? parseDateSafe(dateInput)   // normalise to noon UTC first
    : dateInput;                 // Date objects already have a real time
  if (!d) return '';
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE }).format(d);
}

export { TIMEZONE };
