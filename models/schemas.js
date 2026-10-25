// Data schemas and validation for Budget App
// All records include userId for future auth compatibility

import { parseDateSafe } from '@/lib/date-utils';

export const ACCOUNT_TYPES = ['checking', 'savings', 'credit', 'investment', 'cash', 'other'];
export const TRANSACTION_TYPES = ['income', 'expense', 'transfer'];
export const RULE_FREQUENCIES = ['daily', 'weekly', 'biweekly', 'monthly', 'quarterly', 'yearly'];
export const BUCKET_TYPES = ['spending_limit', 'item_goal', 'savings_placeholder'];
export const EXPENSE_CATEGORIES = [
  'Rent', 'Cost of Living', 'Food', 'Going Out', 'Gifts', 'Travel', 'Memberships', 'Misc'
];
export const INCOME_CATEGORIES = ['Work', 'One-Time'];

export const DEFAULT_BUDGET_SETTINGS = {
  lookbackMonths: 6,
  outlierThresholdPct: 35,
  savingsTargetMode: 'percent', // 'percent' | 'amount'
  savingsTargetValue: 20,       // signed: positive = save, negative = allowed drawdown/loss
  projectionHorizonMonths: 6,
  projectionTargetDate: null,
};

export function validateAccount(data) {
  const errors = [];
  if (!data.name || data.name.trim().length === 0) errors.push('Account name is required');
  if (!ACCOUNT_TYPES.includes(data.type)) errors.push('Invalid account type');
  if (data.balance === undefined || data.balance === null || isNaN(Number(data.balance))) {
    errors.push('Balance must be a number');
  }
  return { valid: errors.length === 0, errors };
}

export function validateTransaction(data) {
  const errors = [];
  if (!data.description || data.description.trim().length === 0) errors.push('Description is required');
  if (!data.amount || isNaN(Number(data.amount)) || Number(data.amount) === 0) {
    errors.push('Amount must be a non-zero number');
  }
  if (!TRANSACTION_TYPES.includes(data.type)) errors.push('Invalid transaction type');
  if (!data.date) errors.push('Date is required');
  if (!data.accountId) errors.push('Account is required');
  return { valid: errors.length === 0, errors };
}

export function validateRule(data) {
  const errors = [];
  if (!data.name || data.name.trim().length === 0) errors.push('Rule name is required');
  if (!data.amount || isNaN(Number(data.amount)) || Number(data.amount) === 0) {
    errors.push('Amount must be a non-zero number');
  }
  if (!RULE_FREQUENCIES.includes(data.frequency)) errors.push('Invalid frequency');
  if (!TRANSACTION_TYPES.includes(data.type)) errors.push('Invalid type');
  if (!data.startDate) errors.push('Start date is required');
  return { valid: errors.length === 0, errors };
}

export function createAccountDoc(data, userId) {
  const balance = Number(data.balance);
  return {
    userId,
    name: data.name.trim(),
    type: data.type,
    balance,
    initialBalance: balance,  // Preserved forever — never $inc'd
    institution: data.institution?.trim() || '',
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

export function createTransactionDoc(data, userId) {
  return {
    userId,
    accountId: data.accountId,
    amount: Number(data.amount),
    description: data.description.trim(),
    category: data.category || 'Misc',
    date: parseDateSafe(data.date),
    type: data.type,
    isRecurring: data.isRecurring || false,
    ruleId: data.ruleId || null,
    notes: data.notes?.trim() || '',
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

export function createRuleDoc(data, userId) {
  return {
    userId,
    name: data.name.trim(),
    amount: Number(data.amount),
    category: data.category || 'Misc',
    frequency: data.frequency,
    startDate: parseDateSafe(data.startDate),
    endDate: data.endDate ? parseDateSafe(data.endDate) : null,
    accountId: data.accountId || null,
    type: data.type,
    description: data.description?.trim() || '',
    isActive: data.isActive !== false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

export function validateBudgetConfig(data) {
  const errors = [];
  if (!data || typeof data !== 'object') {
    return { valid: false, errors: ['Invalid budget payload'] };
  }

  if (data.settings !== undefined) {
    const s = data.settings;
    if (typeof s !== 'object' || s === null) {
      errors.push('Settings must be an object');
    } else {
      if (s.lookbackMonths !== undefined && (isNaN(Number(s.lookbackMonths)) || Number(s.lookbackMonths) < 1 || Number(s.lookbackMonths) > 60)) {
        errors.push('Lookback months must be between 1 and 60');
      }
      if (s.outlierThresholdPct !== undefined && (isNaN(Number(s.outlierThresholdPct)) || Number(s.outlierThresholdPct) < 0 || Number(s.outlierThresholdPct) > 500)) {
        errors.push('Outlier threshold percentage must be between 0 and 500');
      }
      if (s.projectionHorizonMonths !== undefined && (isNaN(Number(s.projectionHorizonMonths)) || Number(s.projectionHorizonMonths) < 1 || Number(s.projectionHorizonMonths) > 240)) {
        errors.push('Projection horizon must be between 1 and 240 months');
      }
      if (s.savingsTargetMode !== undefined && !['percent', 'amount'].includes(s.savingsTargetMode)) {
        errors.push('Invalid savings target mode');
      }
      if (s.savingsTargetValue !== undefined && isNaN(Number(s.savingsTargetValue))) {
        errors.push('Savings target value must be a number');
      }
    }
  }

  if (data.buckets !== undefined) {
    if (!Array.isArray(data.buckets)) {
      errors.push('Buckets must be an array');
    } else {
      data.buckets.forEach((b, idx) => {
        if (!b || typeof b !== 'object') {
          errors.push(`Bucket #${idx + 1} is invalid`);
          return;
        }
        if (!b.name || String(b.name).trim().length === 0) {
          errors.push(`Bucket #${idx + 1}: name is required`);
        }
        if (!BUCKET_TYPES.includes(b.type)) {
          errors.push(`Bucket #${idx + 1}: invalid bucket type`);
        }
        if (b.monthlyAmount !== undefined && (isNaN(Number(b.monthlyAmount)) || Number(b.monthlyAmount) < 0)) {
          errors.push(`Bucket #${idx + 1}: monthly amount must be a non-negative number`);
        }
        if (b.incomePercentage !== undefined && (isNaN(Number(b.incomePercentage)) || Number(b.incomePercentage) < 0 || Number(b.incomePercentage) > 1000)) {
          errors.push(`Bucket #${idx + 1}: percentage must be a valid non-negative number`);
        }
      });
    }
  }

  return { valid: errors.length === 0, errors };
}

export function createBudgetConfigDoc(data, userId) {
  const s = data?.settings || {};
  const settings = {
    lookbackMonths: Number.isFinite(Number(s.lookbackMonths))
      ? Math.max(1, Math.min(60, Math.round(Number(s.lookbackMonths))))
      : DEFAULT_BUDGET_SETTINGS.lookbackMonths,
    outlierThresholdPct: Number.isFinite(Number(s.outlierThresholdPct))
      ? Math.max(0, Math.min(500, Number(s.outlierThresholdPct)))
      : DEFAULT_BUDGET_SETTINGS.outlierThresholdPct,
    savingsTargetMode: ['percent', 'amount'].includes(s.savingsTargetMode)
      ? s.savingsTargetMode
      : DEFAULT_BUDGET_SETTINGS.savingsTargetMode,
    savingsTargetValue: Number.isFinite(Number(s.savingsTargetValue))
      ? Number(s.savingsTargetValue)
      : DEFAULT_BUDGET_SETTINGS.savingsTargetValue,
    projectionHorizonMonths: Number.isFinite(Number(s.projectionHorizonMonths))
      ? Math.max(1, Math.min(240, Math.round(Number(s.projectionHorizonMonths))))
      : DEFAULT_BUDGET_SETTINGS.projectionHorizonMonths,
    projectionTargetDate: s.projectionTargetDate ? parseDateSafe(s.projectionTargetDate) : null,
  };

  const buckets = Array.isArray(data?.buckets)
    ? data.buckets.map((b, i) => ({
        id: b.id ? String(b.id) : `bkt_${Date.now()}_${i}`,
        name: String(b.name || 'Untitled').trim(),
        type: BUCKET_TYPES.includes(b.type) ? b.type : 'spending_limit',
        incomePercentage: Number.isFinite(Number(b.incomePercentage))
          ? Math.max(0, Number(b.incomePercentage))
          : 0,
        monthlyAmount: Math.max(0, Number(b.monthlyAmount) || 0),
        categories: Array.isArray(b.categories)
          ? b.categories.map(String).filter(Boolean)
          : [],
        ruleIds: Array.isArray(b.ruleIds)
          ? b.ruleIds.map(String).filter(Boolean)
          : [],
        transactionIds: Array.isArray(b.transactionIds)
          ? b.transactionIds.map(String).filter(Boolean)
          : [],
        includeRecurring: b.includeRecurring !== undefined ? Boolean(b.includeRecurring) : true,
        targetAmount: b.targetAmount !== undefined && b.targetAmount !== '' && b.targetAmount !== null
          ? Math.max(0, Number(b.targetAmount) || 0)
          : null,
        startingSaved: b.startingSaved !== undefined && b.startingSaved !== '' && b.startingSaved !== null
          ? Math.max(0, Number(b.startingSaved) || 0)
          : 0,
        targetDate: b.targetDate ? parseDateSafe(b.targetDate) : null,
      }))
    : [];

  return {
    userId,
    settings,
    buckets,
    updatedAt: new Date(),
  };
}
