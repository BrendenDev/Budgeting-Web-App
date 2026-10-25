// Module 1: Historical Baseline & Outlier-Trimmed Monthly Averages
// Pure, standalone calculation module — never mutates inputs or touches calculation-engine.js.

import { getTodayMT, toDateStringMT } from '../date-utils.js';

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/**
 * Build the list of completed calendar months (or including current month if requested)
 * going backwards from `todayStr` (YYYY-MM-DD).
 *
 * @param {number} lookbackMonths - Number of months to include (1..60)
 * @param {boolean} includeCurrentMonth - Whether to include the current partial month (default false)
 * @param {string} [todayOverride] - Optional YYYY-MM-DD override for deterministic testing
 * @returns {Array<{ key: string, year: number, month: number, label: string }>}
 */
export function getLookbackMonthKeys(lookbackMonths = 6, includeCurrentMonth = false, todayOverride) {
  const todayStr = todayOverride || getTodayMT();
  const [todayY, todayM] = todayStr.split('-').map(Number); // todayM is 1-based
  const count = Math.max(1, Math.min(60, Math.round(Number(lookbackMonths) || 6)));

  const startOffset = includeCurrentMonth ? 0 : 1; // 1 = start at last completed month
  const list = [];

  for (let i = startOffset; i < startOffset + count; i++) {
    const d = new Date(Date.UTC(todayY, (todayM - 1) - i, 1, 12, 0, 0));
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth(); // 0-based
    const key = `${y}-${String(m + 1).padStart(2, '0')}`;
    list.push({
      key,
      year: y,
      month: m,
      label: `${MONTH_NAMES[m]} ${y}`,
    });
  }

  return list;
}

/**
 * Compute monthly totals, each month's signed deviation % from the raw mean,
 * and the outlier-trimmed average after dropping months where |deviationPct| > outlierThresholdPct.
 *
 * By default, only completed past months that have at least one transaction (or sit at/after the
 * user's earliest transaction month in the window) are averaged so empty months before the user
 * started using the app don't drag the mean toward $0.
 *
 * @param {Array} transactions
 * @param {Object} options
 * @param {number} [options.lookbackMonths=6]
 * @param {number} [options.outlierThresholdPct=35]
 * @param {boolean} [options.includeRecurring=true]
 * @param {boolean} [options.includeCurrentMonth=false]
 * @param {string[]} [options.categories] - Optional category filter (empty = all categories)
 * @param {string} [options.todayOverride]
 */
export function calculateHistoricalBaseline(transactions = [], options = {}) {
  const {
    lookbackMonths = 6,
    outlierThresholdPct = 35,
    includeRecurring = true,
    includeCurrentMonth = false,
    categories = [],
    allowedMonthKeys = null,
    todayOverride,
  } = options;

  const safeTx = Array.isArray(transactions) ? transactions : [];
  const threshold = Math.max(0, Number(outlierThresholdPct) ?? 35);
  const categorySet = Array.isArray(categories) && categories.length > 0 ? new Set(categories) : null;
  const allowedKeySet = Array.isArray(allowedMonthKeys) && allowedMonthKeys.length > 0
    ? new Set(allowedMonthKeys)
    : null;

  const monthSlots = getLookbackMonthKeys(lookbackMonths, includeCurrentMonth, todayOverride);
  const slotMap = new Map(
    monthSlots.map((slot) => [
      slot.key,
      {
        ...slot,
        income: 0,
        recurringExpenses: 0,
        oneTimeExpenses: 0,
        totalAllExpenses: 0,
        expenses: 0, // respects includeRecurring
        txCount: 0,
        anyLedgerTxCount: 0, // tracks whether user had any transaction at all in this month
      },
    ])
  );

  let earliestLedgerMonthKey = null;

  // Aggregate transactions into month slots
  for (const tx of safeTx) {
    if (!tx?.date) continue;
    const dateStr = toDateStringMT(tx.date);
    const key = dateStr.slice(0, 7); // YYYY-MM
    if (!earliestLedgerMonthKey || key < earliestLedgerMonthKey) {
      earliestLedgerMonthKey = key;
    }
    const bucket = slotMap.get(key);
    if (!bucket) continue;

    bucket.anyLedgerTxCount += 1;

    const amt = Math.abs(Number(tx.amount) || 0);
    if (tx.type === 'income') {
      if (!categorySet) {
        bucket.income += amt;
        bucket.txCount += 1;
      }
    } else if (tx.type === 'expense') {
      if (categorySet && !categorySet.has(tx.category || 'Misc')) continue;
      bucket.totalAllExpenses += amt;
      if (tx.isRecurring) {
        bucket.recurringExpenses += amt;
      } else {
        bucket.oneTimeExpenses += amt;
      }
      if (includeRecurring || !tx.isRecurring) {
        bucket.expenses += amt;
      }
      bucket.txCount += 1;
    }
  }

  const orderedSlots = Array.from(slotMap.values());

  // A month is part of the user's active history if it has any transaction OR is on/after the
  // user's earliest recorded transaction month (so a $0 category month is counted as $0, while
  // pre-signup months before the user started tracking are ignored).
  const isMonthActive = (m) =>
    m.anyLedgerTxCount > 0 || (earliestLedgerMonthKey !== null && m.key >= earliestLedgerMonthKey);

  const activeMonths = orderedSlots.filter(isMonthActive);
  const candidateMonths = activeMonths.length > 0 ? activeMonths : orderedSlots;

  const count = candidateMonths.length;
  const rawAvgExpenses = count > 0
    ? candidateMonths.reduce((s, m) => s + m.expenses, 0) / count
    : 0;
  const rawAvgIncome = count > 0
    ? candidateMonths.reduce((s, m) => s + m.income, 0) / count
    : 0;
  const rawAvgRecurring = count > 0
    ? candidateMonths.reduce((s, m) => s + m.recurringExpenses, 0) / count
    : 0;
  const rawAvgOneTime = count > 0
    ? candidateMonths.reduce((s, m) => s + m.oneTimeExpenses, 0) / count
    : 0;

  // Decorate each month in the lookback window with its deviation % and outlier status
  const evaluatedMonths = orderedSlots.map((m) => {
    const hasData = isMonthActive(m);
    const expenseDeviationPct = hasData && rawAvgExpenses > 0
      ? ((m.expenses - rawAvgExpenses) / rawAvgExpenses) * 100
      : 0;
    const incomeDeviationPct = hasData && rawAvgIncome > 0
      ? ((m.income - rawAvgIncome) / rawAvgIncome) * 100
      : 0;

    const isExpenseOutlier = allowedKeySet
      ? hasData && !allowedKeySet.has(m.key)
      : hasData && rawAvgExpenses > 0 && Math.abs(expenseDeviationPct) > threshold;

    const isIncomeOutlier = allowedKeySet
      ? false
      : hasData && rawAvgIncome > 0 && Math.abs(incomeDeviationPct) > threshold;

    const isOutlier = isIncomeOutlier || isExpenseOutlier;

    return {
      key: m.key,
      year: m.year,
      month: m.month,
      label: m.label,
      hasData,
      income: Number(m.income.toFixed(2)),
      expenses: Number(m.expenses.toFixed(2)),
      recurringExpenses: Number(m.recurringExpenses.toFixed(2)),
      oneTimeExpenses: Number(m.oneTimeExpenses.toFixed(2)),
      totalAllExpenses: Number(m.totalAllExpenses.toFixed(2)),
      net: Number((m.income - m.expenses).toFixed(2)),
      expenseDeviationPct: Number(expenseDeviationPct.toFixed(1)),
      incomeDeviationPct: Number(incomeDeviationPct.toFixed(1)),
      isIncomeOutlier,
      isExpenseOutlier,
      isOutlier,
    };
  });

  // Separate outlier trimming for Income vs Expenses:
  // 1. Mean income is trimmed using months where !isIncomeOutlier
  // 2. Mean expenses is trimmed using months where !isExpenseOutlier
  // Fallback: if all active months are flagged in either dimension, fall back to all active months.
  const activeEvaluated = evaluatedMonths.filter((m) => m.hasData);

  const nonOutlierIncomeMonths = activeEvaluated.filter((m) => !m.isIncomeOutlier);
  const keptForIncome = nonOutlierIncomeMonths.length > 0 ? nonOutlierIncomeMonths : activeEvaluated;

  const nonOutlierExpenseMonths = activeEvaluated.filter((m) => !m.isExpenseOutlier);
  const keptForExpenses = nonOutlierExpenseMonths.length > 0 ? nonOutlierExpenseMonths : activeEvaluated;

  const keptIncomeCount = keptForIncome.length;
  const keptExpenseCount = keptForExpenses.length;

  const trimmedAvgIncome = keptIncomeCount > 0
    ? keptForIncome.reduce((s, m) => s + m.income, 0) / keptIncomeCount
    : 0;
  const trimmedAvgExpenses = keptExpenseCount > 0
    ? keptForExpenses.reduce((s, m) => s + m.expenses, 0) / keptExpenseCount
    : 0;
  const trimmedAvgRecurring = keptExpenseCount > 0
    ? keptForExpenses.reduce((s, m) => s + m.recurringExpenses, 0) / keptExpenseCount
    : 0;
  const trimmedAvgOneTime = keptExpenseCount > 0
    ? keptForExpenses.reduce((s, m) => s + m.oneTimeExpenses, 0) / keptExpenseCount
    : 0;
  const trimmedAvgAllExpenses = keptExpenseCount > 0
    ? keptForExpenses.reduce((s, m) => s + m.totalAllExpenses, 0) / keptExpenseCount
    : 0;

  const anyOutlierCount = activeEvaluated.filter((m) => m.isOutlier).length;

  return {
    lookbackMonths,
    outlierThresholdPct: threshold,
    includeRecurring,
    months: evaluatedMonths,
    keptMonthKeys: keptForExpenses.map((m) => m.key),
    activeMonthCount: activeEvaluated.length,
    keptMonthCount: activeEvaluated.length - anyOutlierCount,
    keptIncomeMonthCount: nonOutlierIncomeMonths.length,
    keptExpenseMonthCount: nonOutlierExpenseMonths.length,
    excludedCount: anyOutlierCount,
    allExcludedFallback:
      activeEvaluated.length > 0 &&
      (nonOutlierIncomeMonths.length === 0 || nonOutlierExpenseMonths.length === 0),
    rawAvgExpenses: Number(rawAvgExpenses.toFixed(2)),
    rawAvgIncome: Number(rawAvgIncome.toFixed(2)),
    rawAvgRecurring: Number(rawAvgRecurring.toFixed(2)),
    rawAvgOneTime: Number(rawAvgOneTime.toFixed(2)),
    trimmedAvgExpenses: Number(trimmedAvgExpenses.toFixed(2)),
    trimmedAvgIncome: Number(trimmedAvgIncome.toFixed(2)),
    trimmedAvgRecurring: Number(trimmedAvgRecurring.toFixed(2)),
    trimmedAvgOneTime: Number(trimmedAvgOneTime.toFixed(2)),
    trimmedAvgAllExpenses: Number(trimmedAvgAllExpenses.toFixed(2)),
    trimmedAvgNet: Number((trimmedAvgIncome - trimmedAvgExpenses).toFixed(2)),
  };
}
