// Budget Calculation Engine
// Client-side engine for financial projections based on recurring rules

import { getTodayMT, getCurrentMonthMT, getCurrentYearMT, parseDateSafe, toDateStringMT } from './date-utils';

/**
 * Calculate the next occurrence of a recurring rule from a given date.
 * Preserves the day-of-month for monthly rules (e.g. the 15th stays the 15th).
 */
export function getNextOccurrence(frequency, fromDate, anchorDay) {
  const date = new Date(fromDate);
  switch (frequency) {
    case 'daily':
      date.setUTCDate(date.getUTCDate() + 1);
      break;
    case 'weekly':
      date.setUTCDate(date.getUTCDate() + 7);
      break;
    case 'biweekly':
      date.setUTCDate(date.getUTCDate() + 14);
      break;
    case 'monthly': {
      date.setUTCMonth(date.getUTCMonth() + 1);
      // Clamp to anchor day (e.g. Jan 31 → Feb 28, but Mar should go back to 31)
      if (anchorDay) {
        const maxDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
        date.setUTCDate(Math.min(anchorDay, maxDay));
      }
      break;
    }
    case 'quarterly': {
      date.setUTCMonth(date.getUTCMonth() + 3);
      if (anchorDay) {
        const maxDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
        date.setUTCDate(Math.min(anchorDay, maxDay));
      }
      break;
    }
    case 'yearly':
      date.setUTCFullYear(date.getUTCFullYear() + 1);
      break;
    default:
      date.setUTCMonth(date.getUTCMonth() + 1);
  }
  return date;
}

/**
 * Generate all occurrences of a rule within a date range.
 * Uses noon-UTC dates to avoid timezone boundary issues.
 */
export function generateRuleOccurrences(rule, startDate, endDate) {
  const occurrences = [];
  const safeStart = parseDateSafe(startDate);
  const safeEnd = parseDateSafe(endDate);
  let currentDate = parseDateSafe(rule.startDate);
  if (!currentDate || !safeStart || !safeEnd) return occurrences;

  const anchorDay = currentDate.getUTCDate();

  // Find first occurrence on or after startDate
  while (currentDate < safeStart) {
    currentDate = getNextOccurrence(rule.frequency, currentDate, anchorDay);
  }

  // Generate all occurrences until endDate
  while (currentDate <= safeEnd) {
    if (rule.endDate) {
      const safeRuleEnd = parseDateSafe(rule.endDate);
      if (safeRuleEnd && currentDate > safeRuleEnd) break;
    }

    occurrences.push({
      date: new Date(currentDate),
      amount: rule.type === 'income' ? rule.amount : -rule.amount,
      description: rule.name,
      category: rule.category,
      type: rule.type,
      ruleId: rule._id,
      accountId: rule.accountId,
    });

    currentDate = getNextOccurrence(rule.frequency, currentDate, anchorDay);
  }

  return occurrences;
}

/**
 * Project account balances over time
 * @param {Object[]} accounts - Current accounts with balances
 * @param {Object[]} rules - Active recurring rules
 * @param {number} days - Number of days to project forward (default 90)
 * @returns {Object} Projections data including daily balances and summary
 */
export function projectBalances(accounts, rules, days = 90) {
  const safeAccounts = Array.isArray(accounts) ? accounts : [];
  const safeRules = Array.isArray(rules) ? rules : [];

  const todayStr = getTodayMT();
  const today = parseDateSafe(todayStr);

  const endDate = new Date(today);
  endDate.setUTCDate(endDate.getUTCDate() + days);

  // Initialize running balances per account
  const balances = {};
  safeAccounts.forEach((acc) => {
    balances[acc._id] = acc.balance;
  });

  // Generate all future transactions from rules
  const activeRules = safeRules.filter((r) => r.isActive !== false);
  let allOccurrences = [];
  activeRules.forEach((rule) => {
    const occurrences = generateRuleOccurrences(rule, today, endDate);
    allOccurrences = allOccurrences.concat(occurrences);
  });

  // Sort by date
  allOccurrences.sort((a, b) => a.date - b.date);

  // Build daily projection
  const dailyProjection = [];
  let totalBalance = Object.values(balances).reduce((sum, b) => sum + b, 0);

  // Add starting point
  dailyProjection.push({
    date: new Date(today),
    totalBalance,
    balances: { ...balances },
    transactions: [],
  });

  // Group occurrences by date key
  const dateMap = {};
  allOccurrences.forEach((occ) => {
    const key = toDateStringMT(occ.date);
    if (!dateMap[key]) dateMap[key] = [];
    dateMap[key].push(occ);
  });

  // Build day-by-day projection
  const runningBalances = { ...balances };
  for (let d = 1; d <= days; d++) {
    const date = new Date(today);
    date.setUTCDate(date.getUTCDate() + d);
    const dateKey = toDateStringMT(date);
    const dayTransactions = dateMap[dateKey] || [];

    dayTransactions.forEach((tx) => {
      if (tx.accountId && runningBalances[tx.accountId] !== undefined) {
        runningBalances[tx.accountId] += tx.amount;
      } else {
        // Distribute to first account if no specific account
        const firstAccountId = Object.keys(runningBalances)[0];
        if (firstAccountId) {
          runningBalances[firstAccountId] += tx.amount;
        }
      }
    });

    const dayTotal = Object.values(runningBalances).reduce((sum, b) => sum + b, 0);

    dailyProjection.push({
      date: new Date(date),
      totalBalance: dayTotal,
      balances: { ...runningBalances },
      transactions: dayTransactions,
    });
  }

  // Calculate projections summary
  const projectedIncome = allOccurrences
    .filter((o) => o.type === 'income')
    .reduce((sum, o) => sum + o.amount, 0);

  const projectedExpenses = allOccurrences
    .filter((o) => o.type === 'expense')
    .reduce((sum, o) => sum + Math.abs(o.amount), 0);

  const finalBalance = dailyProjection[dailyProjection.length - 1]?.totalBalance || totalBalance;

  return {
    startingBalance: totalBalance,
    projectedBalance: finalBalance,
    projectedIncome,
    projectedExpenses,
    netCashFlow: projectedIncome - projectedExpenses,
    dailyProjection,
    occurrences: allOccurrences,
    period: { start: today, end: endDate, days },
  };
}

/**
 * Calculate monthly summary from transactions.
 * Uses Mountain Time month/year comparison to avoid UTC boundary mismatch.
 */
export function calculateMonthlySummary(transactions, month, year) {
  const safeTransactions = Array.isArray(transactions) ? transactions : [];
  const filtered = safeTransactions.filter((tx) => {
    const dateStr = toDateStringMT(tx.date);
    const [y, m] = dateStr.split('-').map(Number);
    return (m - 1) === month && y === year;
  });

  const income = filtered
    .filter((tx) => tx.type === 'income')
    .reduce((sum, tx) => sum + tx.amount, 0);

  const expenses = filtered
    .filter((tx) => tx.type === 'expense')
    .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);

  // Category breakdown
  const byCategory = {};
  filtered
    .filter((tx) => tx.type === 'expense')
    .forEach((tx) => {
      const cat = tx.category || 'Misc';
      byCategory[cat] = (byCategory[cat] || 0) + Math.abs(tx.amount);
    });

  const categoryBreakdown = Object.entries(byCategory)
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount);

  return {
    month,
    year,
    income,
    expenses,
    net: income - expenses,
    transactionCount: filtered.length,
    expenseCount: filtered.filter((tx) => tx.type === 'expense').length,
    incomeCount: filtered.filter((tx) => tx.type === 'income').length,
    categoryBreakdown,
  };
}

/**
 * Format currency amount
 */
export function formatCurrency(amount) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(amount);
}

/**
 * Format date for display — using Mountain Time
 */
export function formatDate(date) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'America/Denver',
  }).format(new Date(date));
}

/**
 * Get color for category chart
 */
const CATEGORY_COLORS = [
  '#6366f1', '#10b981', '#f43f5e', '#f59e0b', '#06b6d4',
  '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#3b82f6',
  '#84cc16', '#ef4444', '#a855f7', '#22c55e', '#e11d48',
  '#0ea5e9', '#eab308', '#d946ef',
];

export function getCategoryColor(index) {
  return CATEGORY_COLORS[index % CATEGORY_COLORS.length];
}
