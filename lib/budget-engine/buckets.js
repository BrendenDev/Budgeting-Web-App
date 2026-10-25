// Module 2 & 3: Bucket Evaluator (Spending Caps, Savings Goals & Item Goals)
// Pure, standalone calculation module — supports per-bucket recurring inclusion/exclusion.

import { getCurrentMonthMT, getCurrentYearMT, getTodayMT, toDateStringMT } from '../date-utils.js';
import { calculateHistoricalBaseline } from './baseline.js';

/**
 * Filter transactions that belong to a given spending bucket in a given month/year.
 */
export function filterBucketTransactions(transactions = [], bucket, month, year) {
  const safeTx = Array.isArray(transactions) ? transactions : [];
  const cats = Array.isArray(bucket?.categories) && bucket.categories.length > 0
    ? new Set(bucket.categories)
    : null;
  const includeRecurring = Boolean(bucket?.includeRecurring);

  return safeTx.filter((tx) => {
    if (tx?.type !== 'expense') return false;
    if (!includeRecurring && tx.isRecurring) return false;
    if (cats && !cats.has(tx.category || 'Misc')) return false;
    if (month !== undefined && year !== undefined) {
      const dateStr = toDateStringMT(tx.date);
      const [y, m] = dateStr.split('-').map(Number);
      if ((m - 1) !== month || y !== year) return false;
    }
    return true;
  });
}

/**
 * Evaluate a single bucket against current month transactions and historical baseline settings.
 */
export function evaluateBucket(bucket, transactions = [], baselineSettings = {}, targetPeriod = {}) {
  const month = targetPeriod.month ?? getCurrentMonthMT();
  const year = targetPeriod.year ?? getCurrentYearMT();
  const monthlyAmount = Math.max(0, Number(bucket?.monthlyAmount) || 0);
  const type = bucket?.type || 'spending_limit';

  if (type === 'spending_limit') {
    const matchingThisMonth = filterBucketTransactions(transactions, bucket, month, year);
    const spentThisMonth = matchingThisMonth.reduce((s, tx) => s + Math.abs(Number(tx.amount) || 0), 0);

    // Also compute how much recurring vs one-time happened in this bucket's categories this month
    const cats = Array.isArray(bucket?.categories) && bucket.categories.length > 0
      ? new Set(bucket.categories)
      : null;
    const allCatTxThisMonth = (Array.isArray(transactions) ? transactions : []).filter((tx) => {
      if (tx?.type !== 'expense') return false;
      if (cats && !cats.has(tx.category || 'Misc')) return false;
      const dateStr = toDateStringMT(tx.date);
      const [y, m] = dateStr.split('-').map(Number);
      return (m - 1) === month && y === year;
    });
    const recurringInCategories = allCatTxThisMonth
      .filter((tx) => tx.isRecurring)
      .reduce((s, tx) => s + Math.abs(Number(tx.amount) || 0), 0);
    const oneTimeInCategories = allCatTxThisMonth
      .filter((tx) => !tx.isRecurring)
      .reduce((s, tx) => s + Math.abs(Number(tx.amount) || 0), 0);

    // Historical outlier-trimmed average for this specific bucket's categories + recurring setting
    const bucketBaseline = calculateHistoricalBaseline(transactions, {
      lookbackMonths: baselineSettings.lookbackMonths ?? 6,
      outlierThresholdPct: baselineSettings.outlierThresholdPct ?? 35,
      includeRecurring: Boolean(bucket?.includeRecurring),
      includeCurrentMonth: Boolean(baselineSettings.includeCurrentMonthInBaseline),
      categories: bucket?.categories || [],
    });

    const remaining = monthlyAmount - spentThisMonth;
    const utilizationPct = monthlyAmount > 0 ? (spentThisMonth / monthlyAmount) * 100 : 0;
    const status = utilizationPct > 100 ? 'over' : utilizationPct >= 85 ? 'near' : 'under';

    return {
      ...bucket,
      monthlyAmount,
      spentThisMonth: Number(spentThisMonth.toFixed(2)),
      recurringInCategories: Number(recurringInCategories.toFixed(2)),
      oneTimeInCategories: Number(oneTimeInCategories.toFixed(2)),
      historicalTrimmedAvg: bucketBaseline.trimmedAvgExpenses,
      remaining: Number(remaining.toFixed(2)),
      utilizationPct: Number(utilizationPct.toFixed(1)),
      status,
      matchingTransactionCount: matchingThisMonth.length,
    };
  }

  // Savings goal or Specific item goal
  const targetAmount = bucket?.targetAmount !== null && bucket?.targetAmount !== undefined && Number(bucket.targetAmount) > 0
    ? Number(bucket.targetAmount)
    : null;
  const startingSaved = Math.max(0, Number(bucket?.startingSaved) || 0);
  const remainingToGoal = targetAmount !== null ? Math.max(0, targetAmount - startingSaved) : null;
  const progressPct = targetAmount && targetAmount > 0
    ? Math.min(100, (startingSaved / targetAmount) * 100)
    : null;

  const monthsToGoal = remainingToGoal !== null && monthlyAmount > 0
    ? Math.ceil(remainingToGoal / monthlyAmount)
    : null;

  // If a targetDate is set, calculate how many months until targetDate and required monthly amount
  let monthsUntilTargetDate = null;
  let requiredMonthlyForTargetDate = null;
  if (bucket?.targetDate) {
    const todayStr = getTodayMT();
    const targetStr = toDateStringMT(bucket.targetDate);
    if (targetStr) {
      const [ty, tm] = todayStr.split('-').map(Number);
      const [gy, gm] = targetStr.split('-').map(Number);
      monthsUntilTargetDate = Math.max(1, (gy - ty) * 12 + (gm - tm));
      if (remainingToGoal !== null) {
        requiredMonthlyForTargetDate = Number((remainingToGoal / monthsUntilTargetDate).toFixed(2));
      }
    }
  }

  return {
    ...bucket,
    monthlyAmount,
    targetAmount,
    startingSaved: Number(startingSaved.toFixed(2)),
    remainingToGoal: remainingToGoal !== null ? Number(remainingToGoal.toFixed(2)) : null,
    progressPct: progressPct !== null ? Number(progressPct.toFixed(1)) : null,
    monthsToGoal,
    monthsUntilTargetDate,
    requiredMonthlyForTargetDate,
  };
}

/**
 * Evaluate all buckets and return grouped lists + aggregate monthly totals.
 */
export function evaluateAllBuckets(buckets = [], transactions = [], baselineSettings = {}, targetPeriod = {}) {
  const safeBuckets = Array.isArray(buckets) ? buckets : [];
  const evaluated = safeBuckets.map((b) => evaluateBucket(b, transactions, baselineSettings, targetPeriod));

  const spendingBuckets = evaluated.filter((b) => b.type === 'spending_limit');
  const goalBuckets = evaluated.filter((b) => b.type === 'savings_goal' || b.type === 'item_goal');

  const totalSpendingCaps = spendingBuckets.reduce((s, b) => s + b.monthlyAmount, 0);
  const totalSpentInBucketsThisMonth = spendingBuckets.reduce((s, b) => s + b.spentThisMonth, 0);
  const totalGoalAllocations = goalBuckets.reduce((s, b) => s + b.monthlyAmount, 0);

  return {
    all: evaluated,
    spendingBuckets,
    goalBuckets,
    totalSpendingCaps: Number(totalSpendingCaps.toFixed(2)),
    totalSpentInBucketsThisMonth: Number(totalSpentInBucketsThisMonth.toFixed(2)),
    totalGoalAllocations: Number(totalGoalAllocations.toFixed(2)),
  };
}
