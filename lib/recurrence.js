// Recurrence engine — the single source of truth for recurring-rule dates.
//
// Used by the server (materialization, rule edits, occurrence audit) and the
// client (balance projections). Pure functions, no I/O, no dependencies
// beyond date-utils.

import { parseDateSafe } from './date-utils';

/**
 * Advance a noon-UTC date by one period of the given frequency.
 * Monthly/quarterly rules clamp to the anchor day without drifting
 * (Jan 31 → Feb 28 → Mar 31).
 */
export function advanceDate(date, frequency, anchorDay) {
  const next = new Date(date);
  switch (frequency) {
    case 'daily':     next.setUTCDate(next.getUTCDate() + 1); break;
    case 'weekly':    next.setUTCDate(next.getUTCDate() + 7); break;
    case 'biweekly':  next.setUTCDate(next.getUTCDate() + 14); break;
    case 'monthly': {
      next.setUTCMonth(next.getUTCMonth() + 1);
      if (anchorDay) {
        const maxDay = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
        next.setUTCDate(Math.min(anchorDay, maxDay));
      }
      break;
    }
    case 'quarterly': {
      next.setUTCMonth(next.getUTCMonth() + 3);
      if (anchorDay) {
        const maxDay = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
        next.setUTCDate(Math.min(anchorDay, maxDay));
      }
      break;
    }
    case 'yearly':    next.setUTCFullYear(next.getUTCFullYear() + 1); break;
    default:          next.setUTCMonth(next.getUTCMonth() + 1);
  }
  return next;
}

/**
 * Generate all occurrence dates for a rule within [startDate, endDate].
 * startDate/endDate must already be noon-UTC Date objects.
 * Respects rule.endDate. Returns an array of new Date objects.
 */
export function generateOccurrenceDates(rule, startDate, endDate) {
  const dates = [];
  let current = parseDateSafe(rule.startDate);
  if (!current || !startDate || !endDate) return dates;

  const anchorDay = current.getUTCDate();
  const ruleEnd = rule.endDate ? parseDateSafe(rule.endDate) : null;

  // Advance to the first occurrence on or after startDate
  while (current < startDate) {
    current = advanceDate(current, rule.frequency, anchorDay);
  }

  // Collect all occurrences up to endDate
  while (current <= endDate) {
    if (ruleEnd && current > ruleEnd) break;
    dates.push(new Date(current));
    current = advanceDate(current, rule.frequency, anchorDay);
  }

  return dates;
}
