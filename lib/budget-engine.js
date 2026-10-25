// Modular Budget Analytics Engine (Client-Side, Pure & Read-Only)
// Divided into 3 standalone calculation modules that never mutate live ledger data:
//   Module 1: calculateHistoricalBaseline (completed-month income & expense averages + outlier trimming)
//   Module 2: evaluateAllBuckets (top-down savings target, item buckets, and % spending buckets)
//   Module 3: calculateSavingsProjection (future balance & item payoff date estimator)

import { getCurrentMonthMT, getCurrentYearMT, getTodayMT, toDateStringMT } from './date-utils.js';

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/* ═══════════════════════════════════════════════════════════════════
 * MODULE 1: Historical Baseline & Separate Income / Spend Outlier Filter
 * ═══════════════════════════════════════════════════════════════════ */

/**
 * Build the list of completed past calendar months going backwards from today.
 */
export function getLookbackMonthKeys(lookbackMonths = 6, todayOverride) {
  const todayStr = todayOverride || getTodayMT();
  const [todayY, todayM] = todayStr.split('-').map(Number);
  const count = Math.max(1, Math.min(60, Math.round(Number(lookbackMonths) || 6)));
  const list = [];

  for (let i = 1; i <= count; i++) {
    const d = new Date(Date.UTC(todayY, (todayM - 1) - i, 1, 12, 0, 0));
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth();
    list.push({
      key: `${y}-${String(m + 1).padStart(2, '0')}`,
      year: y,
      month: m,
      label: `${MONTH_NAMES[m]} ${y}`,
    });
  }

  return list;
}

/**
 * Calculate mean income and mean spend separately across completed months,
 * compute each month's signed deviation % from both means, and trim outliers
 * exceeding ±outlierThresholdPct%.
 */
export function calculateHistoricalBaseline(transactions = [], options = {}) {
  const {
    lookbackMonths = 6,
    outlierThresholdPct = 35,
    todayOverride,
  } = options;

  const safeTx = Array.isArray(transactions) ? transactions : [];
  const threshold = Math.max(0, Number(outlierThresholdPct) ?? 35);

  const monthSlots = getLookbackMonthKeys(lookbackMonths, todayOverride);
  const slotMap = new Map(
    monthSlots.map((slot) => [
      slot.key,
      { ...slot, income: 0, expenses: 0, txCount: 0 },
    ])
  );

  let earliestLedgerMonthKey = null;

  for (const tx of safeTx) {
    if (!tx?.date) continue;
    const key = toDateStringMT(tx.date).slice(0, 7);
    if (!earliestLedgerMonthKey || key < earliestLedgerMonthKey) {
      earliestLedgerMonthKey = key;
    }
    const slot = slotMap.get(key);
    if (!slot) continue;

    const amt = Math.abs(Number(tx.amount) || 0);
    if (tx.type === 'income') {
      slot.income += amt;
      slot.txCount += 1;
    } else if (tx.type === 'expense') {
      slot.expenses += amt;
      slot.txCount += 1;
    }
  }

  const orderedSlots = Array.from(slotMap.values());
  const isMonthActive = (m) =>
    m.txCount > 0 || (earliestLedgerMonthKey !== null && m.key >= earliestLedgerMonthKey);

  const activeMonths = orderedSlots.filter(isMonthActive);
  const candidateMonths = activeMonths.length > 0 ? activeMonths : orderedSlots;
  const count = candidateMonths.length;

  const rawAvgIncome = count > 0
    ? candidateMonths.reduce((s, m) => s + m.income, 0) / count
    : 0;
  const rawAvgExpenses = count > 0
    ? candidateMonths.reduce((s, m) => s + m.expenses, 0) / count
    : 0;

  const evaluatedMonths = orderedSlots.map((m) => {
    const hasData = isMonthActive(m);
    const incomeDeviationPct = hasData && rawAvgIncome > 0
      ? ((m.income - rawAvgIncome) / rawAvgIncome) * 100
      : 0;
    const expenseDeviationPct = hasData && rawAvgExpenses > 0
      ? ((m.expenses - rawAvgExpenses) / rawAvgExpenses) * 100
      : 0;

    const isIncomeOutlier = hasData && rawAvgIncome > 0 && Math.abs(incomeDeviationPct) > threshold;
    const isExpenseOutlier = hasData && rawAvgExpenses > 0 && Math.abs(expenseDeviationPct) > threshold;

    return {
      key: m.key,
      year: m.year,
      month: m.month,
      label: m.label,
      hasData,
      income: Number(m.income.toFixed(2)),
      expenses: Number(m.expenses.toFixed(2)),
      net: Number((m.income - m.expenses).toFixed(2)),
      incomeDeviationPct: Number(incomeDeviationPct.toFixed(1)),
      expenseDeviationPct: Number(expenseDeviationPct.toFixed(1)),
      isIncomeOutlier,
      isExpenseOutlier,
      isOutlier: isIncomeOutlier || isExpenseOutlier,
    };
  });

  const activeEvaluated = evaluatedMonths.filter((m) => m.hasData);

  const nonOutlierIncome = activeEvaluated.filter((m) => !m.isIncomeOutlier);
  const keptForIncome = nonOutlierIncome.length > 0 ? nonOutlierIncome : activeEvaluated;

  const nonOutlierExpenses = activeEvaluated.filter((m) => !m.isExpenseOutlier);
  const keptForExpenses = nonOutlierExpenses.length > 0 ? nonOutlierExpenses : activeEvaluated;

  const trimmedAvgIncome = keptForIncome.length > 0
    ? keptForIncome.reduce((s, m) => s + m.income, 0) / keptForIncome.length
    : 0;
  const trimmedAvgExpenses = keptForExpenses.length > 0
    ? keptForExpenses.reduce((s, m) => s + m.expenses, 0) / keptForExpenses.length
    : 0;

  const excludedCount = activeEvaluated.filter((m) => m.isOutlier).length;

  return {
    lookbackMonths,
    outlierThresholdPct: threshold,
    months: evaluatedMonths,
    keptMonthKeys: keptForExpenses.map((m) => m.key),
    activeMonthCount: activeEvaluated.length,
    excludedCount,
    rawAvgIncome: Number(rawAvgIncome.toFixed(2)),
    rawAvgExpenses: Number(rawAvgExpenses.toFixed(2)),
    trimmedAvgIncome: Number(trimmedAvgIncome.toFixed(2)),
    trimmedAvgExpenses: Number(trimmedAvgExpenses.toFixed(2)),
    trimmedAvgNet: Number((trimmedAvgIncome - trimmedAvgExpenses).toFixed(2)),
  };
}

/* ═══════════════════════════════════════════════════════════════════
 * MODULE 2: Top-Down Percentage Buckets & Item Buckets
 * ═══════════════════════════════════════════════════════════════════ */

function buildBucketMatcher(bucket) {
  const txSet = new Set(Array.isArray(bucket?.transactionIds) ? bucket.transactionIds.map(String) : []);
  const ruleSet = new Set(Array.isArray(bucket?.ruleIds) ? bucket.ruleIds.map(String) : []);
  const catSet = new Set(Array.isArray(bucket?.categories) ? bucket.categories : []);
  const includeRecurring = bucket?.includeRecurring !== undefined ? Boolean(bucket.includeRecurring) : true;

  return (tx) => {
    if (!tx || tx.type !== 'expense') return false;
    if (tx._id && txSet.has(String(tx._id))) return true;
    if (tx.ruleId && ruleSet.has(String(tx.ruleId))) return true;
    if (catSet.size > 0) {
      if (!includeRecurring && tx.isRecurring) return false;
      return catSet.has(tx.category || 'Misc');
    }
    if (ruleSet.size > 0 || txSet.size > 0) return false;
    if (!includeRecurring && tx.isRecurring) return false;
    return true;
  };
}

export function filterBucketTransactions(transactions = [], bucket, month, year) {
  const safeTx = Array.isArray(transactions) ? transactions : [];
  const matches = buildBucketMatcher(bucket);

  return safeTx.filter((tx) => {
    if (!matches(tx)) return false;
    if (month !== undefined && year !== undefined) {
      const [y, m] = toDateStringMT(tx.date).split('-').map(Number);
      if ((m - 1) !== month || y !== year) return false;
    }
    return true;
  });
}

export function evaluateGoalBucket(bucket, todayOverride) {
  const todayStr = todayOverride || getTodayMT();
  const [ty, tm] = todayStr.split('-').map(Number);

  const targetAmount = Number(bucket?.targetAmount) > 0 ? Number(bucket.targetAmount) : 0;
  const startingSaved = Math.max(0, Number(bucket?.startingSaved) || 0);
  const remainingToGoal = Math.max(0, targetAmount - startingSaved);
  const manualMonthly = Math.max(0, Number(bucket?.monthlyAmount) || 0);

  let monthsUntilTargetDate = null;
  let requiredMonthlyForTargetDate = null;
  const targetDateStr = bucket?.targetDate ? toDateStringMT(bucket.targetDate) : null;

  if (targetDateStr) {
    const [gy, gm] = targetDateStr.split('-').map(Number);
    monthsUntilTargetDate = Math.max(1, (gy - ty) * 12 + (gm - tm));
    requiredMonthlyForTargetDate =
      remainingToGoal > 0 ? Number((remainingToGoal / monthsUntilTargetDate).toFixed(2)) : 0;
  }

  const effectiveMonthlyCost =
    manualMonthly > 0
      ? manualMonthly
      : requiredMonthlyForTargetDate !== null
        ? requiredMonthlyForTargetDate
        : 0;

  const monthsToGoal =
    remainingToGoal > 0 && effectiveMonthlyCost > 0
      ? Math.ceil(remainingToGoal / effectiveMonthlyCost)
      : remainingToGoal === 0 && targetAmount > 0
        ? 0
        : monthsUntilTargetDate;

  let estimatedPayoffLabel = null;
  if (monthsToGoal !== null && monthsToGoal >= 0) {
    const payoffDate = new Date(Date.UTC(ty, (tm - 1) + monthsToGoal, 1, 12, 0, 0));
    estimatedPayoffLabel = `${MONTH_NAMES[payoffDate.getUTCMonth()]} ${payoffDate.getUTCFullYear()}`;
  }

  const progressPct =
    targetAmount > 0 ? Math.min(100, Number(((startingSaved / targetAmount) * 100).toFixed(1))) : 0;

  return {
    ...bucket,
    targetDate: targetDateStr,
    targetAmount: Number(targetAmount.toFixed(2)),
    startingSaved: Number(startingSaved.toFixed(2)),
    remainingToGoal: Number(remainingToGoal.toFixed(2)),
    monthlyAmount: Number(effectiveMonthlyCost.toFixed(2)),
    effectiveMonthlyCost: Number(effectiveMonthlyCost.toFixed(2)),
    monthsUntilTargetDate,
    requiredMonthlyForTargetDate,
    monthsToGoal,
    estimatedPayoffLabel,
    progressPct,
  };
}

export function evaluateBucket(
  bucket,
  transactions = [],
  targetPeriod = {},
  poolContext = {}
) {
  if ((bucket?.type || 'spending_limit') !== 'spending_limit') {
    return evaluateGoalBucket(bucket, targetPeriod.todayOverride);
  }

  const month = targetPeriod.month ?? getCurrentMonthMT();
  const year = targetPeriod.year ?? getCurrentYearMT();
  const currentMonthKey = `${year}-${String(month + 1).padStart(2, '0')}`;
  const spendablePool = poolContext.spendablePool ?? 0;
  const spendablePoolWithoutItems = poolContext.spendablePoolWithoutItems ?? spendablePool;
  const keptKeySet = poolContext.keptKeySet || new Set();

  let incomePercentage = Number(bucket?.incomePercentage) || 0;
  if (incomePercentage === 0 && Number(bucket?.monthlyAmount) > 0 && spendablePool > 0) {
    incomePercentage = Number(((Number(bucket.monthlyAmount) / spendablePool) * 100).toFixed(1));
  }

  const maxSpend = (spendablePool * incomePercentage) / 100;
  const maxSpendWithoutItems = (spendablePoolWithoutItems * incomePercentage) / 100;

  // Single pass over transactions to compute both current-month spend and historical average
  const matches = buildBucketMatcher(bucket);
  let spentThisMonth = 0;
  let totalHistorical = 0;

  for (const tx of Array.isArray(transactions) ? transactions : []) {
    if (!matches(tx)) continue;
    const amt = Math.abs(Number(tx.amount) || 0);
    const key = toDateStringMT(tx.date).slice(0, 7);
    if (key === currentMonthKey) {
      spentThisMonth += amt;
    }
    if (keptKeySet.has(key)) {
      totalHistorical += amt;
    }
  }

  const historicalTrimmedAvg = keptKeySet.size > 0 ? totalHistorical / keptKeySet.size : 0;
  const remaining = maxSpend - spentThisMonth;
  const utilizationPct = maxSpend > 0 ? (spentThisMonth / maxSpend) * 100 : 0;
  const status = utilizationPct > 100 ? 'over' : utilizationPct >= 85 ? 'near' : 'under';

  return {
    ...bucket,
    incomePercentage: Number(incomePercentage.toFixed(1)),
    monthlyAmount: Number(maxSpend.toFixed(2)),
    maxSpend: Number(maxSpend.toFixed(2)),
    maxSpendWithoutItems: Number(maxSpendWithoutItems.toFixed(2)),
    spentThisMonth: Number(spentThisMonth.toFixed(2)),
    historicalTrimmedAvg: Number(historicalTrimmedAvg.toFixed(2)),
    remaining: Number(remaining.toFixed(2)),
    utilizationPct: Number(utilizationPct.toFixed(1)),
    status,
  };
}

export function evaluateAllBuckets(
  buckets = [],
  transactions = [],
  baselineSettings = {},
  targetPeriod = {},
  precomputedBaseline = null
) {
  const safeBuckets = Array.isArray(buckets) ? buckets : [];
  const baseline =
    precomputedBaseline ||
    calculateHistoricalBaseline(transactions, {
      lookbackMonths: baselineSettings.lookbackMonths ?? 6,
      outlierThresholdPct: baselineSettings.outlierThresholdPct ?? 35,
      todayOverride: targetPeriod.todayOverride,
    });

  const avgIncome = baseline.trimmedAvgIncome;
  const savingsTargetMode = baselineSettings.savingsTargetMode || 'percent';
  const savingsTargetValue = Number(baselineSettings.savingsTargetValue ?? 20);

  const monthlySavingsTarget =
    savingsTargetMode === 'percent'
      ? (avgIncome * savingsTargetValue) / 100
      : savingsTargetValue;

  const savingsTargetPct =
    savingsTargetMode === 'percent'
      ? savingsTargetValue
      : avgIncome > 0
        ? (savingsTargetValue / avgIncome) * 100
        : 0;

  const incomeAfterSavings = avgIncome - monthlySavingsTarget;

  // Evaluate Item Buckets first so their monthly cost reduces the spendable pool
  const goalBuckets = safeBuckets
    .filter((b) => b.type === 'item_goal')
    .map((b) => evaluateGoalBucket(b, targetPeriod.todayOverride));

  const totalItemMonthlyCost = goalBuckets.reduce((s, g) => s + g.effectiveMonthlyCost, 0);
  const spendablePoolWithoutItems = Math.max(0, incomeAfterSavings);
  const spendablePool = Math.max(0, incomeAfterSavings - totalItemMonthlyCost);

  const poolContext = {
    spendablePool,
    spendablePoolWithoutItems,
    keptKeySet: new Set(baseline.keptMonthKeys || []),
  };

  const spendingBuckets = safeBuckets
    .filter((b) => b.type !== 'item_goal')
    .map((b) => evaluateBucket(b, transactions, targetPeriod, poolContext));

  const totalAllocatedPct = spendingBuckets.reduce(
    (s, b) => s + (Number(b.incomePercentage) || 0),
    0
  );
  const unallocatedPct = 100 - totalAllocatedPct;
  const totalSpendingCaps = spendingBuckets.reduce((s, b) => s + b.maxSpend, 0);
  const unallocatedSpendableDollar = spendablePool - totalSpendingCaps;

  return {
    avgIncome: Number(avgIncome.toFixed(2)),
    savingsTargetMode,
    savingsTargetValue: Number(savingsTargetValue.toFixed(2)),
    savingsTargetPct: Number(savingsTargetPct.toFixed(1)),
    monthlySavingsTarget: Number(monthlySavingsTarget.toFixed(2)),
    incomeAfterSavings: Number(incomeAfterSavings.toFixed(2)),
    totalItemMonthlyCost: Number(totalItemMonthlyCost.toFixed(2)),
    spendablePoolWithoutItems: Number(spendablePoolWithoutItems.toFixed(2)),
    spendablePool: Number(spendablePool.toFixed(2)),
    totalAllocatedPct: Number(totalAllocatedPct.toFixed(1)),
    unallocatedPct: Number(unallocatedPct.toFixed(1)),
    unallocatedSpendableDollar: Number(unallocatedSpendableDollar.toFixed(2)),
    spendingBuckets,
    goalBuckets,
    totalSpendingCaps: Number(totalSpendingCaps.toFixed(2)),
  };
}

/* ═══════════════════════════════════════════════════════════════════
 * MODULE 3: Future Balance & Item Payoff Date Estimator
 * ═══════════════════════════════════════════════════════════════════ */

export function calculateSavingsProjection({
  transactions = [],
  accounts = [],
  buckets = [],
  settings = {},
  precomputedBaseline = null,
  precomputedBucketEval = null,
} = {}) {
  const todayStr = getTodayMT();
  const [ty, tm] = todayStr.split('-').map(Number);

  let horizonMonths = Math.max(
    1,
    Math.min(240, Math.round(Number(settings.projectionHorizonMonths ?? 6)))
  );
  let targetDateStr = settings.projectionTargetDate
    ? toDateStringMT(settings.projectionTargetDate)
    : null;

  if (targetDateStr) {
    const [gy, gm] = targetDateStr.split('-').map(Number);
    if (gy && gm) {
      horizonMonths = Math.max(1, Math.min(240, (gy - ty) * 12 + (gm - tm)));
    }
  } else {
    const computedEnd = new Date(Date.UTC(ty, (tm - 1) + horizonMonths, 1, 12, 0, 0));
    targetDateStr = `${computedEnd.getUTCFullYear()}-${String(computedEnd.getUTCMonth() + 1).padStart(2, '0')}-01`;
  }

  const endDateObj = new Date(Date.UTC(ty, (tm - 1) + horizonMonths, 1, 12, 0, 0));
  const horizonEndLabel = `${MONTH_NAMES[endDateObj.getUTCMonth()]} ${endDateObj.getUTCFullYear()}`;

  const fullBaseline =
    precomputedBaseline ||
    calculateHistoricalBaseline(transactions, {
      lookbackMonths: settings.lookbackMonths ?? 6,
      outlierThresholdPct: settings.outlierThresholdPct ?? 35,
    });

  const bucketEval =
    precomputedBucketEval ||
    evaluateAllBuckets(buckets, transactions, settings, {}, fullBaseline);

  const currentBalance = (Array.isArray(accounts) ? accounts : []).reduce(
    (sum, a) => sum + (Number(a.balance) || 0),
    0
  );

  const overAllocatedAmount = Math.max(0, bucketEval.totalSpendingCaps - bucketEval.spendablePool);
  const monthlySavingsBudgeted = bucketEval.monthlySavingsTarget - overAllocatedAmount;
  const projectedNetSavingsBudgeted = monthlySavingsBudgeted * horizonMonths;

  const goalProjections = bucketEval.goalBuckets.map((g) => {
    const start = Math.max(0, Number(g.startingSaved) || 0);
    const monthly = Math.max(0, Number(g.effectiveMonthlyCost) || 0);
    const target = g.targetAmount > 0 ? Number(g.targetAmount) : null;
    const rawProjected = start + monthly * horizonMonths;
    const projectedAtHorizon = target !== null ? Math.min(target, rawProjected) : rawProjected;
    const willReachGoal = target !== null ? rawProjected >= target : null;

    return {
      id: g.id,
      name: g.name,
      startingSaved: Number(start.toFixed(2)),
      monthlyAmount: Number(monthly.toFixed(2)),
      targetAmount: target,
      targetDate: g.targetDate,
      monthsToGoal: g.monthsToGoal,
      estimatedPayoffLabel: g.estimatedPayoffLabel,
      projectedAtHorizon: Number(projectedAtHorizon.toFixed(2)),
      willReachGoal,
    };
  });

  return {
    horizonMonths,
    targetDateStr,
    horizonEndLabel,
    currentBalance: Number(currentBalance.toFixed(2)),
    savingsTargetPct: bucketEval.savingsTargetPct,
    monthlySavingsBudgeted: Number(monthlySavingsBudgeted.toFixed(2)),
    projectedNetSavingsBudgeted: Number(projectedNetSavingsBudgeted.toFixed(2)),
    projectedBalanceBudgeted: Number((currentBalance + projectedNetSavingsBudgeted).toFixed(2)),
    goalProjections,
  };
}
