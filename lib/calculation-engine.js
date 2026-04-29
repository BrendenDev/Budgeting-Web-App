// Budget Calculation Engine
// Client-side engine for financial projections based on recurring rules

/**
 * Calculate the next occurrence of a recurring rule from a given date
 */
export function getNextOccurrence(frequency, fromDate) {
  const date = new Date(fromDate);
  switch (frequency) {
    case 'daily':
      date.setDate(date.getDate() + 1);
      break;
    case 'weekly':
      date.setDate(date.getDate() + 7);
      break;
    case 'biweekly':
      date.setDate(date.getDate() + 14);
      break;
    case 'monthly':
      date.setMonth(date.getMonth() + 1);
      break;
    case 'quarterly':
      date.setMonth(date.getMonth() + 3);
      break;
    case 'yearly':
      date.setFullYear(date.getFullYear() + 1);
      break;
    default:
      date.setMonth(date.getMonth() + 1);
  }
  return date;
}

/**
 * Generate all occurrences of a rule within a date range
 */
export function generateRuleOccurrences(rule, startDate, endDate) {
  const occurrences = [];
  let currentDate = new Date(rule.startDate);

  // Find first occurrence on or after startDate
  while (currentDate < startDate) {
    currentDate = getNextOccurrence(rule.frequency, currentDate);
  }

  // Generate all occurrences until endDate
  while (currentDate <= endDate) {
    if (rule.endDate && currentDate > new Date(rule.endDate)) break;

    occurrences.push({
      date: new Date(currentDate),
      amount: rule.type === 'income' ? rule.amount : -rule.amount,
      description: rule.name,
      category: rule.category,
      type: rule.type,
      ruleId: rule._id,
      accountId: rule.accountId,
    });

    currentDate = getNextOccurrence(rule.frequency, currentDate);
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
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const endDate = new Date(today);
  endDate.setDate(endDate.getDate() + days);

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

  // Group occurrences by date
  const dateMap = {};
  allOccurrences.forEach((occ) => {
    const key = occ.date.toISOString().split('T')[0];
    if (!dateMap[key]) dateMap[key] = [];
    dateMap[key].push(occ);
  });

  // Build day-by-day projection
  const runningBalances = { ...balances };
  for (let d = 1; d <= days; d++) {
    const date = new Date(today);
    date.setDate(date.getDate() + d);
    const dateKey = date.toISOString().split('T')[0];
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
 * Calculate monthly summary from transactions
 */
export function calculateMonthlySummary(transactions, month, year) {
  const safeTransactions = Array.isArray(transactions) ? transactions : [];
  const filtered = safeTransactions.filter((tx) => {
    const txDate = new Date(tx.date);
    return txDate.getMonth() === month && txDate.getFullYear() === year;
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
 * Format date for display
 */
export function formatDate(date) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
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
