// Module 4: End-of-Horizon Savings & Balance Projector
// Pure, standalone calculation module — combines the outlier-trimmed baseline and user buckets
// to estimate total savings at the end of a configurable horizon (months or target date).

import { getTodayMT } from '../date-utils.js';
import { calculateHistoricalBaseline } from './baseline.js';

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/**
 * Estimate monthly cash flow, goal accumulation, and end-of-horizon savings.
 *
 * How budgeted spending is combined with historical data so recurring costs are never double-counted
 * or accidentally dropped:
 *   1. Each `spending_limit` bucket covers its assigned categories (or all categories if empty).
 *   2. If a `spending_limit` bucket has `includeRecurring: false`, the recurring expenses in those
 *      categories are added back from the historical trimmed recurring baseline (`unbucketedRecurring`)
 *      so your actual monthly bills are still accounted for in the net savings estimate.
 *   3. Any expense categories not covered by *any* spending_limit bucket use their historical
 *      outlier-trimmed average (`unbucketedCategoriesSpend`).
 *
 * @param {Object} params
 * @param {Array} params.transactions
 * @param {Array} params.accounts
 * @param {Array} params.buckets
 * @param {Object} params.settings - { lookbackMonths, outlierThresholdPct, projectionHorizonMonths }
 * @param {number} [params.horizonMonthsOverride]
 */
export function calculateSavingsProjection({
  transactions = [],
  accounts = [],
  buckets = [],
  settings = {},
  horizonMonthsOverride,
} = {}) {
  const lookbackMonths = settings.lookbackMonths ?? 6;
  const outlierThresholdPct = settings.outlierThresholdPct ?? 35;
  const includeCurrentMonth = Boolean(settings.includeCurrentMonthInBaseline);
  const horizonMonths = Math.max(
    1,
    Math.min(240, Math.round(Number(horizonMonthsOverride ?? settings.projectionHorizonMonths ?? 6)))
  );

  // Full baseline (including recurring) gives us trimmed income, recurring, and one-time averages
  const fullBaseline = calculateHistoricalBaseline(transactions, {
    lookbackMonths,
    outlierThresholdPct,
    includeRecurring: true,
    includeCurrentMonth,
  });

  const currentBalance = (Array.isArray(accounts) ? accounts : []).reduce(
    (sum, a) => sum + (Number(a.balance) || 0),
    0
  );

  const safeBuckets = Array.isArray(buckets) ? buckets : [];
  const spendingBuckets = safeBuckets.filter((b) => b.type === 'spending_limit');
  const goalBuckets = safeBuckets.filter((b) => b.type === 'savings_goal' || b.type === 'item_goal');

  const plannedBucketSpend = spendingBuckets.reduce((s, b) => s + (Number(b.monthlyAmount) || 0), 0);
  const plannedGoalContributions = goalBuckets.reduce((s, b) => s + (Number(b.monthlyAmount) || 0), 0);

  // Determine which categories are covered by spending_limit buckets
  const hasCatchAllBucket = spendingBuckets.some(
    (b) => !Array.isArray(b.categories) || b.categories.length === 0
  );

  let unbucketedRecurring = 0;
  let unbucketedCategorySpend = 0;

  if (spendingBuckets.length === 0) {
    // No spending caps defined yet: fall back to historical trimmed average
    unbucketedCategorySpend = fullBaseline.trimmedAvgOneTime;
    unbucketedRecurring = fullBaseline.trimmedAvgRecurring;
  } else if (hasCatchAllBucket) {
    // A catch-all bucket covers all categories; check if any catch-all bucket includes recurring
    const catchAllIncludesRecurring = spendingBuckets.some(
      (b) => (!Array.isArray(b.categories) || b.categories.length === 0) && b.includeRecurring
    );
    if (!catchAllIncludesRecurring) {
      unbucketedRecurring = fullBaseline.trimmedAvgRecurring;
    }
  } else {
    // Category-specific buckets: find categories covered with recurring vs without recurring
    const coveredCategories = new Set();
    const recurringCoveredCategories = new Set();

    for (const b of spendingBuckets) {
      for (const cat of b.categories || []) {
        coveredCategories.add(cat);
        if (b.includeRecurring) recurringCoveredCategories.add(cat);
      }
    }

    // Compute trimmed historical spend for categories NOT in coveredCategories,
    // and recurring spend for categories in coveredCategories where includeRecurring === false.
    const allCategoriesInTx = new Set(
      (Array.isArray(transactions) ? transactions : [])
        .filter((tx) => tx?.type === 'expense')
        .map((tx) => tx.category || 'Misc')
    );

    const uncoveredCats = Array.from(allCategoriesInTx).filter((c) => !coveredCategories.has(c));
    if (uncoveredCats.length > 0) {
      const uncoveredBaseline = calculateHistoricalBaseline(transactions, {
        lookbackMonths,
        outlierThresholdPct,
        includeRecurring: true,
        includeCurrentMonth,
        categories: uncoveredCats,
        allowedMonthKeys: fullBaseline.keptMonthKeys,
      });
      unbucketedCategorySpend = uncoveredBaseline.trimmedAvgExpenses;
    }

    const catsMissingRecurring = Array.from(coveredCategories).filter(
      (c) => !recurringCoveredCategories.has(c)
    );
    if (catsMissingRecurring.length > 0) {
      const missingRecBaseline = calculateHistoricalBaseline(transactions, {
        lookbackMonths,
        outlierThresholdPct,
        includeRecurring: true,
        includeCurrentMonth,
        categories: catsMissingRecurring,
        allowedMonthKeys: fullBaseline.keptMonthKeys,
      });
      unbucketedRecurring = missingRecBaseline.trimmedAvgRecurring;
    }
  }

  const totalEffectiveMonthlySpend =
    plannedBucketSpend + unbucketedRecurring + unbucketedCategorySpend;

  const monthlyIncome = fullBaseline.trimmedAvgIncome;

  // Net monthly savings under the bucket plan vs under historical baseline
  const monthlySavingsBudgeted = monthlyIncome - totalEffectiveMonthlySpend;
  const monthlySavingsHistorical = fullBaseline.trimmedAvgIncome - fullBaseline.trimmedAvgAllExpenses;

  // How much of the budgeted monthly savings is earmarked for specific goal buckets vs unallocated
  const unallocatedMonthlySurplus = monthlySavingsBudgeted - plannedGoalContributions;

  // End-of-horizon totals
  const todayStr = getTodayMT();
  const [ty, tm] = todayStr.split('-').map(Number);
  const endDateObj = new Date(Date.UTC(ty, (tm - 1) + horizonMonths, 1, 12, 0, 0));
  const horizonEndLabel = `${MONTH_NAMES[endDateObj.getUTCMonth()]} ${endDateObj.getUTCFullYear()}`;

  const projectedNetSavingsBudgeted = monthlySavingsBudgeted * horizonMonths;
  const projectedNetSavingsHistorical = monthlySavingsHistorical * horizonMonths;
  const projectedGoalAccumulation = plannedGoalContributions * horizonMonths;
  const projectedUnallocatedAccumulation = unallocatedMonthlySurplus * horizonMonths;

  // Per-goal projection at horizon
  const goalProjections = goalBuckets.map((g) => {
    const start = Math.max(0, Number(g.startingSaved) || 0);
    const monthly = Math.max(0, Number(g.monthlyAmount) || 0);
    const target = g.targetAmount !== null && g.targetAmount !== undefined && Number(g.targetAmount) > 0
      ? Number(g.targetAmount)
      : null;
    const rawProjected = start + monthly * horizonMonths;
    const projectedAtHorizon = target !== null ? Math.min(target, rawProjected) : rawProjected;
    const willReachGoal = target !== null ? rawProjected >= target : null;

    return {
      id: g.id,
      name: g.name,
      type: g.type,
      startingSaved: Number(start.toFixed(2)),
      monthlyAmount: Number(monthly.toFixed(2)),
      targetAmount: target,
      projectedAtHorizon: Number(projectedAtHorizon.toFixed(2)),
      willReachGoal,
    };
  });

  return {
    horizonMonths,
    horizonEndLabel,
    currentBalance: Number(currentBalance.toFixed(2)),
    monthlyIncome: Number(monthlyIncome.toFixed(2)),
    plannedBucketSpend: Number(plannedBucketSpend.toFixed(2)),
    unbucketedRecurring: Number(unbucketedRecurring.toFixed(2)),
    unbucketedCategorySpend: Number(unbucketedCategorySpend.toFixed(2)),
    totalEffectiveMonthlySpend: Number(totalEffectiveMonthlySpend.toFixed(2)),
    plannedGoalContributions: Number(plannedGoalContributions.toFixed(2)),
    monthlySavingsBudgeted: Number(monthlySavingsBudgeted.toFixed(2)),
    monthlySavingsHistorical: Number(monthlySavingsHistorical.toFixed(2)),
    unallocatedMonthlySurplus: Number(unallocatedMonthlySurplus.toFixed(2)),
    projectedNetSavingsBudgeted: Number(projectedNetSavingsBudgeted.toFixed(2)),
    projectedNetSavingsHistorical: Number(projectedNetSavingsHistorical.toFixed(2)),
    projectedGoalAccumulation: Number(projectedGoalAccumulation.toFixed(2)),
    projectedUnallocatedAccumulation: Number(projectedUnallocatedAccumulation.toFixed(2)),
    projectedBalanceBudgeted: Number((currentBalance + projectedNetSavingsBudgeted).toFixed(2)),
    projectedBalanceHistorical: Number((currentBalance + projectedNetSavingsHistorical).toFixed(2)),
    goalProjections,
  };
}
