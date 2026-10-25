// Budget Calculation Engine
// Client-side engine for financial projections based on recurring rules

import { getTodayMT, parseDateSafe, toDateStringMT, TIMEZONE } from './date-utils';
import { generateOccurrenceDates } from './recurrence';

/**
 * Generate all occurrences of a rule within a date range.
 * Uses noon-UTC dates to avoid timezone boundary issues.
 * Date math is shared with the server via lib/recurrence.js.
 */
function generateRuleOccurrences(rule, startDate, endDate) {
  const safeStart = parseDateSafe(startDate);
  const safeEnd = parseDateSafe(endDate);
  if (!safeStart || !safeEnd) return [];

  return generateOccurrenceDates(rule, safeStart, safeEnd).map((date) => ({
    date,
    amount: rule.type === 'income' ? rule.amount : -rule.amount,
    description: rule.name,
    category: rule.category,
    type: rule.type,
    ruleId: rule._id,
    accountId: rule.accountId,
  }));
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

  const recurringExpenses = filtered
    .filter((tx) => tx.type === 'expense' && tx.isRecurring)
    .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);

  const oneTimeExpenses = filtered
    .filter((tx) => tx.type === 'expense' && !tx.isRecurring)
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
    recurringExpenses,
    oneTimeExpenses,
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
 * Format date for display — using system timezone
 */
export function formatDate(date) {
  // Use parseDateSafe to normalise to noon UTC — prevents the off-by-one
  // that occurs when new Date("YYYY-MM-DD") creates midnight UTC and
  // timezone formatting shifts it to the previous calendar day.
  const safe = parseDateSafe(date);
  if (!safe) return '';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: TIMEZONE,
  }).format(safe);
}

/**
 * Calculate cumulative spending day-by-day for a given month.
 * Returns an array of { day, cumulative } for pacing chart.
 */
export function calculateSpendingPacing(transactions, month, year) {
  const safeTransactions = Array.isArray(transactions) ? transactions : [];
  const filtered = safeTransactions.filter(tx => {
    if (tx.type !== 'expense') return false;
    const dateStr = toDateStringMT(tx.date);
    const [y, m] = dateStr.split('-').map(Number);
    return (m - 1) === month && y === year;
  });

  // Group by day
  const dayMap = {};
  filtered.forEach(tx => {
    const dateStr = toDateStringMT(tx.date);
    const day = parseInt(dateStr.split('-')[2], 10);
    dayMap[day] = (dayMap[day] || 0) + Math.abs(tx.amount);
  });

  // Build cumulative array
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const result = [];
  let cumulative = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    cumulative += dayMap[d] || 0;
    result.push({ day: d, cumulative: Number(cumulative.toFixed(2)) });
  }
  return result;
}



/**
 * Calculate savings rate from income and expenses.
 * Returns { rate (0-100), band: 'red'|'amber'|'green' }
 */
export function calculateSavingsRate(income, expenses) {
  if (income <= 0) return { rate: 0, band: 'red' };
  const rate = ((income - expenses) / income) * 100;
  let band;
  if (rate < 10) band = 'red';
  else if (rate < 20) band = 'amber';
  else band = 'green';
  return { rate: Number(rate.toFixed(1)), band };
}

/**
 * Calculate daily burn rate for current month.
 * @returns {{ dailyAvg: number, daysElapsed: number, projected: number }}
 */
export function calculateDailyBurnRate(transactions, month, year) {
  const safeTransactions = Array.isArray(transactions) ? transactions : [];
  const todayStr = getTodayMT();
  const [todayY, todayM, todayD] = todayStr.split('-').map(Number);

  // Only count up to today if current month
  const isCurrentMonth = month === (todayM - 1) && year === todayY;
  const daysElapsed = isCurrentMonth ? todayD : new Date(year, month + 1, 0).getDate();

  const expenses = safeTransactions
    .filter(tx => {
      if (tx.type !== 'expense') return false;
      const dateStr = toDateStringMT(tx.date);
      const [y, m] = dateStr.split('-').map(Number);
      return (m - 1) === month && y === year;
    })
    .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);

  const dailyAvg = daysElapsed > 0 ? expenses / daysElapsed : 0;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const projected = dailyAvg * daysInMonth;

  return {
    dailyAvg: Number(dailyAvg.toFixed(2)),
    daysElapsed,
    projected: Number(projected.toFixed(2)),
  };
}

/**
 * Calculate month-over-month comparison.
 * @returns {{ thisMonth: { income, expenses, net }, lastMonth: { income, expenses, net }, deltas }}
 */
export function calculateMonthComparison(transactions, month, year) {
  const thisMonthSummary = calculateMonthlySummary(transactions, month, year);
  const pm = month === 0 ? 11 : month - 1;
  const py = month === 0 ? year - 1 : year;
  const lastMonthSummary = calculateMonthlySummary(transactions, pm, py);

  const expenseDelta = lastMonthSummary.expenses > 0
    ? ((thisMonthSummary.expenses - lastMonthSummary.expenses) / lastMonthSummary.expenses * 100)
    : 0;

  const incomeDelta = lastMonthSummary.income > 0
    ? ((thisMonthSummary.income - lastMonthSummary.income) / lastMonthSummary.income * 100)
    : 0;

  return {
    thisMonth: {
      income: thisMonthSummary.income,
      expenses: thisMonthSummary.expenses,
      net: thisMonthSummary.net,
    },
    lastMonth: {
      income: lastMonthSummary.income,
      expenses: lastMonthSummary.expenses,
      net: lastMonthSummary.net,
    },
    deltas: {
      expenses: Number(expenseDelta.toFixed(1)),
      income: Number(incomeDelta.toFixed(1)),
    },
  };
}

