// Modular Budget Analytics Engine (Client-Side, Pure & Read-Only)
// Module 1: calculateHistoricalBaseline (completed-month income & expense averages + outlier trimming)
// Module 2: evaluateAllBuckets (top-down savings target, spending buckets, % category buckets, % savings placeholders)
// Module 3: calculateSavingsProjection (future balance & payoff date estimator)

import { getCurrentMonthMT, getCurrentYearMT, getTodayMT, toDateStringMT } from './date-utils.js';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const round2 = (n) => Number((Number(n) || 0).toFixed(2));
const round1 = (n) => Number((Number(n) || 0).toFixed(1));

/* ── Module 1: Historical Baseline & Separate Income / Spend Outlier Filter ── */

export function getLookbackMonthKeys(lookbackMonths = 6, todayOverride) {
  const [todayY, todayM] = (todayOverride || getTodayMT()).split('-').map(Number);
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

export function calculateHistoricalBaseline(transactions = [], options = {}) {
  const { lookbackMonths = 6, outlierThresholdPct = 35, todayOverride } = options;
  const safeTx = Array.isArray(transactions) ? transactions : [];
  const threshold = Math.max(0, Number(outlierThresholdPct) || 0);

  const monthSlots = getLookbackMonthKeys(lookbackMonths, todayOverride);
  const slotMap = new Map(monthSlots.map((s) => [s.key, { ...s, income: 0, expenses: 0, txCount: 0 }]));
  let earliestKey = null;

  for (const tx of safeTx) {
    if (!tx?.date) continue;
    const key = toDateStringMT(tx.date).slice(0, 7);
    if (!earliestKey || key < earliestKey) earliestKey = key;
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

  const ordered = Array.from(slotMap.values());
  const isActive = (m) => m.txCount > 0 || (earliestKey !== null && m.key >= earliestKey);
  const active = ordered.filter(isActive);
  const candidates = active.length > 0 ? active : ordered;
  const count = candidates.length;

  const rawAvgIncome = count > 0 ? candidates.reduce((s, m) => s + m.income, 0) / count : 0;
  const rawAvgExpenses = count > 0 ? candidates.reduce((s, m) => s + m.expenses, 0) / count : 0;

  const months = ordered.map((m) => {
    const hasData = isActive(m);
    const incDev = hasData && rawAvgIncome > 0 ? ((m.income - rawAvgIncome) / rawAvgIncome) * 100 : 0;
    const expDev = hasData && rawAvgExpenses > 0 ? ((m.expenses - rawAvgExpenses) / rawAvgExpenses) * 100 : 0;
    const isIncomeOutlier = hasData && rawAvgIncome > 0 && Math.abs(incDev) > threshold;
    const isExpenseOutlier = hasData && rawAvgExpenses > 0 && Math.abs(expDev) > threshold;

    return {
      key: m.key,
      year: m.year,
      month: m.month,
      label: m.label,
      hasData,
      income: round2(m.income),
      expenses: round2(m.expenses),
      net: round2(m.income - m.expenses),
      incomeDeviationPct: round1(incDev),
      expenseDeviationPct: round1(expDev),
      isIncomeOutlier,
      isExpenseOutlier,
      isOutlier: isIncomeOutlier || isExpenseOutlier,
    };
  });

  const activeEval = months.filter((m) => m.hasData);
  const nonOutInc = activeEval.filter((m) => !m.isIncomeOutlier);
  const nonOutExp = activeEval.filter((m) => !m.isExpenseOutlier);
  const keptInc = nonOutInc.length > 0 ? nonOutInc : activeEval;
  const keptExp = nonOutExp.length > 0 ? nonOutExp : activeEval;

  const trimmedAvgIncome = keptInc.length > 0 ? keptInc.reduce((s, m) => s + m.income, 0) / keptInc.length : 0;
  const trimmedAvgExpenses = keptExp.length > 0 ? keptExp.reduce((s, m) => s + m.expenses, 0) / keptExp.length : 0;

  return {
    lookbackMonths,
    outlierThresholdPct: threshold,
    months,
    keptMonthKeys: keptExp.map((m) => m.key),
    activeMonthCount: activeEval.length,
    excludedCount: activeEval.filter((m) => m.isOutlier).length,
    rawAvgIncome: round2(rawAvgIncome),
    rawAvgExpenses: round2(rawAvgExpenses),
    trimmedAvgIncome: round2(trimmedAvgIncome),
    trimmedAvgExpenses: round2(trimmedAvgExpenses),
    trimmedAvgNet: round2(trimmedAvgIncome - trimmedAvgExpenses),
  };
}

/* ── Module 2: Unified Buckets (% Category, % Savings Placeholder, & Purchase Spending Buckets) ── */

function buildBucketMatcher(bucket) {
  if (bucket?.type === 'savings_placeholder' || bucket?.type === 'item_goal') return () => false;
  const txSet = new Set(Array.isArray(bucket?.transactionIds) ? bucket.transactionIds.map(String) : []);
  const ruleSet = new Set(Array.isArray(bucket?.ruleIds) ? bucket.ruleIds.map(String) : []);
  const catSet = new Set(Array.isArray(bucket?.categories) ? bucket.categories : []);
  const includeRecurring = bucket?.includeRecurring !== false;

  return (tx) => {
    if (!tx || tx.type !== 'expense') return false;
    if (tx._id && txSet.has(String(tx._id))) return true;
    if (tx.ruleId && ruleSet.has(String(tx.ruleId))) return true;
    if (catSet.size > 0) return (includeRecurring || !tx.isRecurring) && catSet.has(tx.category || 'Misc');
    if (ruleSet.size > 0 || txSet.size > 0) return false;
    return includeRecurring || !tx.isRecurring;
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
  const [ty, tm] = (todayOverride || getTodayMT()).split('-').map(Number);
  const targetAmount = Number(bucket?.targetAmount) > 0 ? Number(bucket.targetAmount) : 0;
  const startingSaved = Math.max(0, Number(bucket?.startingSaved) || 0);
  const remainingToGoal = Math.max(0, targetAmount - startingSaved);
  const manualMonthly = Math.max(0, Number(bucket?.monthlyAmount) || 0);
  const targetDateStr = bucket?.targetDate ? toDateStringMT(bucket.targetDate) : null;

  let monthsUntilTargetDate = null;
  let requiredMonthlyForTargetDate = null;
  if (targetDateStr) {
    const [gy, gm] = targetDateStr.split('-').map(Number);
    monthsUntilTargetDate = Math.max(1, (gy - ty) * 12 + (gm - tm));
    requiredMonthlyForTargetDate = remainingToGoal > 0 ? round2(remainingToGoal / monthsUntilTargetDate) : 0;
  }

  const effectiveMonthlyCost = manualMonthly > 0 ? manualMonthly : (requiredMonthlyForTargetDate ?? 0);
  const monthsToGoal =
    remainingToGoal > 0 && effectiveMonthlyCost > 0
      ? Math.ceil(remainingToGoal / effectiveMonthlyCost)
      : remainingToGoal === 0 && targetAmount > 0
        ? 0
        : monthsUntilTargetDate;

  let estimatedPayoffLabel = null;
  if (monthsToGoal !== null && monthsToGoal >= 0) {
    const d = new Date(Date.UTC(ty, (tm - 1) + monthsToGoal, 1, 12, 0, 0));
    estimatedPayoffLabel = `${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  }

  return {
    ...bucket,
    type: 'item_goal',
    targetDate: targetDateStr,
    targetAmount: round2(targetAmount),
    startingSaved: round2(startingSaved),
    remainingToGoal: round2(remainingToGoal),
    monthlyAmount: round2(effectiveMonthlyCost),
    effectiveMonthlyCost: round2(effectiveMonthlyCost),
    maxSpend: round2(effectiveMonthlyCost),
    monthsUntilTargetDate,
    requiredMonthlyForTargetDate,
    monthsToGoal,
    estimatedPayoffLabel,
    progressPct: targetAmount > 0 ? Math.min(100, round1((startingSaved / targetAmount) * 100)) : 0,
  };
}

export function evaluateBucket(bucket, transactions = [], targetPeriod = {}, poolContext = {}) {
  const type = bucket?.type || 'spending_limit';
  if (type === 'item_goal') return evaluateGoalBucket(bucket, targetPeriod.todayOverride);

  const spendablePool = poolContext.spendablePool ?? 0;
  const spendablePoolWithoutItems = poolContext.spendablePoolWithoutItems ?? spendablePool;
  const keptKeySet = poolContext.keptKeySet || new Set();

  const rawInput = bucket?.incomePercentage;
  const isCleared = rawInput === '';
  let numericPct = isCleared ? 0 : Number(rawInput) || 0;
  if (!isCleared && numericPct === 0 && Number(bucket?.monthlyAmount) > 0 && spendablePool > 0) {
    numericPct = round1((Number(bucket.monthlyAmount) / spendablePool) * 100);
  }

  const maxSpend = (spendablePool * numericPct) / 100;
  const maxSpendWithoutItems = (spendablePoolWithoutItems * numericPct) / 100;

  let spentThisMonth = 0;
  let totalHistorical = 0;

  if (type === 'spending_limit') {
    const month = targetPeriod.month ?? getCurrentMonthMT();
    const year = targetPeriod.year ?? getCurrentYearMT();
    const currentMonthKey = `${year}-${String(month + 1).padStart(2, '0')}`;
    const matches = buildBucketMatcher(bucket);

    for (const tx of Array.isArray(transactions) ? transactions : []) {
      if (!matches(tx)) continue;
      const amt = Math.abs(Number(tx.amount) || 0);
      const key = toDateStringMT(tx.date).slice(0, 7);
      if (key === currentMonthKey) spentThisMonth += amt;
      if (keptKeySet.has(key)) totalHistorical += amt;
    }
  }

  const historicalTrimmedAvg = type === 'spending_limit' && keptKeySet.size > 0 ? totalHistorical / keptKeySet.size : 0;
  const remaining = maxSpend - spentThisMonth;
  const utilizationPct = type === 'spending_limit' && maxSpend > 0 ? (spentThisMonth / maxSpend) * 100 : 0;

  return {
    ...bucket,
    type,
    rawIncomePercentage: isCleared ? '' : rawInput ?? numericPct,
    incomePercentage: round1(numericPct),
    monthlyAmount: round2(maxSpend),
    maxSpend: round2(maxSpend),
    maxSpendWithoutItems: round2(maxSpendWithoutItems),
    spentThisMonth: round2(spentThisMonth),
    historicalTrimmedAvg: round2(historicalTrimmedAvg),
    remaining: round2(remaining),
    utilizationPct: round1(utilizationPct),
    status: utilizationPct > 100 ? 'over' : utilizationPct >= 85 ? 'near' : 'under',
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
  const savingsTargetValue = Number(baselineSettings.savingsTargetValue) || 0;

  const monthlySavingsTarget =
    savingsTargetMode === 'percent' ? (avgIncome * savingsTargetValue) / 100 : savingsTargetValue;
  const savingsTargetPct =
    savingsTargetMode === 'percent' ? savingsTargetValue : avgIncome > 0 ? (savingsTargetValue / avgIncome) * 100 : 0;
  const incomeAfterSavings = avgIncome - monthlySavingsTarget;

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

  const allBuckets = safeBuckets.map((b) => evaluateBucket(b, transactions, targetPeriod, poolContext));
  const pctBuckets = allBuckets.filter((b) => b.type !== 'item_goal');
  const spendingBuckets = allBuckets.filter((b) => b.type === 'spending_limit');
  const savingsPlaceholderBuckets = allBuckets.filter((b) => b.type === 'savings_placeholder');

  const totalAllocatedPct = pctBuckets.reduce((s, b) => s + (Number(b.incomePercentage) || 0), 0);
  const totalPctAllocatedDollar = pctBuckets.reduce((s, b) => s + b.maxSpend, 0);

  return {
    avgIncome: round2(avgIncome),
    savingsTargetMode,
    savingsTargetValue: round2(savingsTargetValue),
    savingsTargetPct: round1(savingsTargetPct),
    monthlySavingsTarget: round2(monthlySavingsTarget),
    incomeAfterSavings: round2(incomeAfterSavings),
    totalItemMonthlyCost: round2(totalItemMonthlyCost),
    spendablePoolWithoutItems: round2(spendablePoolWithoutItems),
    spendablePool: round2(spendablePool),
    totalAllocatedPct: round1(totalAllocatedPct),
    unallocatedPct: round1(100 - totalAllocatedPct),
    unallocatedSpendableDollar: round2(spendablePool - totalPctAllocatedDollar),
    allBuckets,
    spendingBuckets,
    savingsPlaceholderBuckets,
    goalBuckets,
    totalSpendingCaps: round2(spendingBuckets.reduce((s, b) => s + b.maxSpend, 0)),
    totalSavingsPlaceholderDollar: round2(savingsPlaceholderBuckets.reduce((s, b) => s + b.maxSpend, 0)),
  };
}

/* ── Module 3: Future Balance & Payoff Date Estimator ── */

export function calculateSavingsProjection({
  transactions = [],
  accounts = [],
  buckets = [],
  settings = {},
  precomputedBaseline = null,
  precomputedBucketEval = null,
} = {}) {
  const [ty, tm] = getTodayMT().split('-').map(Number);
  let horizonMonths = Math.max(1, Math.min(240, Math.round(Number(settings.projectionHorizonMonths ?? 6))));
  let targetDateStr = settings.projectionTargetDate ? toDateStringMT(settings.projectionTargetDate) : null;

  if (targetDateStr) {
    const [gy, gm] = targetDateStr.split('-').map(Number);
    if (gy && gm) horizonMonths = Math.max(1, Math.min(240, (gy - ty) * 12 + (gm - tm)));
  } else {
    const end = new Date(Date.UTC(ty, (tm - 1) + horizonMonths, 1, 12, 0, 0));
    targetDateStr = `${end.getUTCFullYear()}-${String(end.getUTCMonth() + 1).padStart(2, '0')}-01`;
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
    precomputedBucketEval || evaluateAllBuckets(buckets, transactions, settings, {}, fullBaseline);

  const currentBalance = (Array.isArray(accounts) ? accounts : []).reduce(
    (sum, a) => sum + (Number(a.balance) || 0),
    0
  );

  const totalPctAllocated = bucketEval.totalSpendingCaps + bucketEval.totalSavingsPlaceholderDollar;
  const overAllocatedAmount = Math.max(0, totalPctAllocated - bucketEval.spendablePool);
  const monthlySavingsBudgeted =
    bucketEval.monthlySavingsTarget + bucketEval.totalSavingsPlaceholderDollar - overAllocatedAmount;
  const projectedNetSavingsBudgeted = monthlySavingsBudgeted * horizonMonths;

  const goalProjections = bucketEval.goalBuckets.map((g) => {
    const rawProjected = g.startingSaved + g.effectiveMonthlyCost * horizonMonths;
    const target = g.targetAmount > 0 ? g.targetAmount : null;
    return {
      id: g.id,
      name: g.name,
      startingSaved: g.startingSaved,
      monthlyAmount: g.effectiveMonthlyCost,
      targetAmount: target,
      targetDate: g.targetDate,
      monthsToGoal: g.monthsToGoal,
      estimatedPayoffLabel: g.estimatedPayoffLabel,
      projectedAtHorizon: round2(target !== null ? Math.min(target, rawProjected) : rawProjected),
      willReachGoal: target !== null ? rawProjected >= target : null,
    };
  });

  return {
    horizonMonths,
    targetDateStr,
    horizonEndLabel,
    currentBalance: round2(currentBalance),
    savingsTargetPct: bucketEval.savingsTargetPct,
    totalSavingsPlaceholderDollar: bucketEval.totalSavingsPlaceholderDollar,
    monthlySavingsBudgeted: round2(monthlySavingsBudgeted),
    projectedNetSavingsBudgeted: round2(projectedNetSavingsBudgeted),
    projectedBalanceBudgeted: round2(currentBalance + projectedNetSavingsBudgeted),
    goalProjections,
  };
}
