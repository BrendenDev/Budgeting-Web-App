'use client';

import { useState, useEffect, useMemo } from 'react';
import { formatCurrency, formatDate } from '@/lib/calculation-engine';
import { getTodayMT, toDateStringMT } from '@/lib/date-utils';
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '@/models/schemas';
import { inputClass, TextButton } from '@/components/ui';

/**
 * Reusable transaction search/filter/aggregate/list component.
 *
 * @param {Object} props
 * @param {Array} props.transactions - Full transaction array
 * @param {Array} props.accounts - Accounts for name resolution
 * @param {string} [props.initialCategory] - Pre-filter to a category
 * @param {string} [props.initialSearch] - Pre-fill search
 * @param {string} [props.initialDateRange] - Pre-set date range ('this-month', 'last-month', etc.)
 * @param {boolean} [props.compact] - Compact mode for inline panels
 * @param {Function} [props.onEdit] - Edit callback (hidden if absent)
 * @param {Function} [props.onDelete] - Delete callback (hidden if absent)
 * @param {string} [props.title] - Optional title to display
 * @param {Function} [props.onClose] - Close callback for inline panels
 */
export default function TransactionExplorer({
  transactions = [],
  accounts = [],
  initialCategory = 'all',
  initialSearch = '',
  initialDateRange = 'all',
  compact = false,
  onEdit,
  onDelete,
  title,
  onClose,
}) {
  const [search, setSearch] = useState(initialSearch);
  const [filterCategory, setFilterCategory] = useState(initialCategory);
  const [filterType, setFilterType] = useState('all');
  const [filterAccount, setFilterAccount] = useState('all');
  const [dateRange, setDateRange] = useState(initialDateRange);
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  // Reset filters when initial props change (e.g. clicking a different category bar)
  useEffect(() => {
    setFilterCategory(initialCategory);
    setSearch(initialSearch);
  }, [initialCategory, initialSearch]);

  const allCategories = [...new Set([...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES])];

  const getAccountName = (id) => {
    const acc = accounts.find(a => a._id === id);
    return acc ? acc.name : '—';
  };

  // Date range boundaries
  const dateFilter = useMemo(() => {
    const todayStr = getTodayMT();
    const [y, m, d] = todayStr.split('-').map(Number);

    switch (dateRange) {
      case 'this-month': {
        const start = `${y}-${String(m).padStart(2, '0')}-01`;
        const end = todayStr;
        return { start, end };
      }
      case 'last-month': {
        const lm = m === 1 ? 12 : m - 1;
        const ly = m === 1 ? y - 1 : y;
        const lastDay = new Date(ly, lm, 0).getDate();
        return {
          start: `${ly}-${String(lm).padStart(2, '0')}-01`,
          end: `${ly}-${String(lm).padStart(2, '0')}-${lastDay}`,
        };
      }
      case 'last-90': {
        const past = new Date(y, m - 1, d - 90);
        const ps = `${past.getFullYear()}-${String(past.getMonth() + 1).padStart(2, '0')}-${String(past.getDate()).padStart(2, '0')}`;
        return { start: ps, end: todayStr };
      }
      case 'ytd': {
        return { start: `${y}-01-01`, end: todayStr };
      }
      case 'custom': {
        return { start: customStart || '2000-01-01', end: customEnd || todayStr };
      }
      default: // 'all'
        return null;
    }
  }, [dateRange, customStart, customEnd]);

  // Filtered transactions
  const filtered = useMemo(() => {
    return transactions.filter(tx => {
      // Text search
      if (search && !tx.description?.toLowerCase().includes(search.toLowerCase())) return false;
      // Category
      if (filterCategory !== 'all' && tx.category !== filterCategory) return false;
      // Type
      if (filterType !== 'all' && tx.type !== filterType) return false;
      // Account
      if (filterAccount !== 'all' && tx.accountId !== filterAccount) return false;
      // Date range
      if (dateFilter) {
        const txDate = toDateStringMT(tx.date);
        if (txDate < dateFilter.start || txDate > dateFilter.end) return false;
      }
      return true;
    });
  }, [transactions, search, filterCategory, filterType, filterAccount, dateFilter]);

  // Aggregates
  const aggregates = useMemo(() => {
    const income = filtered.filter(tx => tx.type === 'income').reduce((s, tx) => s + Math.abs(tx.amount), 0);
    const expenses = filtered.filter(tx => tx.type === 'expense').reduce((s, tx) => s + Math.abs(tx.amount), 0);
    return { count: filtered.length, income, expenses, net: income - expenses };
  }, [filtered]);

  const maxItems = compact ? 50 : 200;
  const displayTx = filtered.slice(0, maxItems);

  const summaryItem = 'flex flex-col gap-0.5 px-3 py-2 first:pl-0';
  const summaryLabel = 'text-[11px] text-faint';

  return (
    <div className={compact ? 'text-sm' : ''}>
      {/* Header */}
      {(title || onClose) && (
        <div className="mb-3 flex items-baseline justify-between gap-3">
          {title && <h3 className="font-title text-base text-ink">{title}</h3>}
          {onClose && (
            <button
              className="cursor-pointer text-sm text-muted transition-colors hover:text-ink"
              onClick={onClose}
              aria-label="Close"
            >close</button>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="mb-3 flex flex-col gap-2">
        <div className="relative">
          <input
            className={`${inputClass} pr-14`}
            type="text"
            placeholder="Search transactions…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button
              className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer text-xs text-muted hover:text-ink"
              onClick={() => setSearch('')}
            >clear</button>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2 md:flex">
          <select className={`${inputClass} cursor-pointer md:flex-1`} value={filterType} onChange={e => setFilterType(e.target.value)}>
            <option value="all">All Types</option>
            <option value="income">Income</option>
            <option value="expense">Expense</option>
          </select>

          <select className={`${inputClass} cursor-pointer md:flex-1`} value={filterCategory} onChange={e => setFilterCategory(e.target.value)}>
            <option value="all">All Categories</option>
            {allCategories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>

          {!compact && (
            <select className={`${inputClass} cursor-pointer md:flex-1`} value={filterAccount} onChange={e => setFilterAccount(e.target.value)}>
              <option value="all">All Accounts</option>
              {accounts.map(a => <option key={a._id} value={a._id}>{a.name}</option>)}
            </select>
          )}

          <select className={`${inputClass} cursor-pointer md:flex-1`} value={dateRange} onChange={e => setDateRange(e.target.value)}>
            <option value="all">All Time</option>
            <option value="this-month">This Month</option>
            <option value="last-month">Last Month</option>
            <option value="last-90">Last 90 Days</option>
            <option value="ytd">Year to Date</option>
            <option value="custom">Custom Range</option>
          </select>
        </div>

        {dateRange === 'custom' && (
          <div className="flex items-center gap-2">
            <input className={inputClass} type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} />
            <span className="text-xs text-muted">to</span>
            <input className={inputClass} type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} />
          </div>
        )}
      </div>

      {/* Aggregate Summary */}
      <div className="mb-1 flex flex-wrap divide-x divide-rule border-y border-rule">
        <div className={summaryItem}>
          <span className={summaryLabel}>Results</span>
          <span className="num text-ink">{aggregates.count}</span>
        </div>
        <div className={summaryItem}>
          <span className={summaryLabel}>Income</span>
          <span className="num text-accent">+{formatCurrency(aggregates.income)}</span>
        </div>
        <div className={summaryItem}>
          <span className={summaryLabel}>Expenses</span>
          <span className="num text-debit">-{formatCurrency(aggregates.expenses)}</span>
        </div>
        <div className={summaryItem}>
          <span className={summaryLabel}>Net</span>
          <span className={`num ${aggregates.net >= 0 ? 'text-accent' : 'text-debit'}`}>
            {aggregates.net >= 0 ? '+' : ''}{formatCurrency(aggregates.net)}
          </span>
        </div>
      </div>

      {/* Transaction List */}
      <div className={compact ? 'max-h-80 overflow-y-auto' : ''}>
        {displayTx.length > 0 ? (
          displayTx.map((tx, i) => (
            <div
              key={tx._id || i}
              className="flex items-center justify-between gap-3 border-b border-rule px-1 py-2.5 transition-colors hover:bg-surface-2"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm text-ink">{tx.description}</div>
                <div className="truncate text-xs text-faint">
                  {tx.category}
                  {!compact && <> · {getAccountName(tx.accountId)}</>}
                  {' · '}{formatDate(tx.date)}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-4">
                <span className={`num text-sm ${tx.type === 'income' ? 'text-accent' : 'text-debit'}`}>
                  {tx.type === 'income' ? '+' : '-'}{formatCurrency(Math.abs(tx.amount))}
                </span>
                {!compact && onEdit && (
                  <TextButton onClick={() => onEdit(tx)} className="text-xs">edit</TextButton>
                )}
                {!compact && onDelete && (
                  <TextButton tone="debit" onClick={() => onDelete(tx)} className="text-xs">delete</TextButton>
                )}
              </div>
            </div>
          ))
        ) : (
          <p className="py-8 text-center text-sm text-faint">No transactions match your filters</p>
        )}
        {filtered.length > maxItems && (
          <p className="py-3 text-center text-xs text-muted">
            Showing {maxItems} of {filtered.length} results
          </p>
        )}
      </div>
    </div>
  );
}
