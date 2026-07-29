// Data schemas and validation for Budget App
// All records include userId for future auth compatibility

import { parseDateSafe } from '@/lib/date-utils';

export const ACCOUNT_TYPES = ['checking', 'savings', 'credit', 'investment', 'cash', 'other'];
export const TRANSACTION_TYPES = ['income', 'expense', 'transfer'];
export const RULE_FREQUENCIES = ['daily', 'weekly', 'biweekly', 'monthly', 'quarterly', 'yearly'];
export const EXPENSE_CATEGORIES = [
  'Rent', 'Cost of Living', 'Food', 'Going Out', 'Gifts', 'Travel', 'Memberships', 'Misc'
];
export const INCOME_CATEGORIES = ['Work', 'One-Time'];

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
  return {
    userId,
    name: data.name.trim(),
    type: data.type,
    balance: Number(data.balance),
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
    category: data.category || 'Miscellaneous',
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
