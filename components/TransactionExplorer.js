'use client';

import { useState, useEffect, useMemo } from 'react';
import { formatCurrency, formatDate, getCategoryColor } from '@/lib/calculation-engine';
import { getTodayMT, toDateStringMT } from '@/lib/date-utils';
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '@/models/schemas';

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
    const now = new Date();
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

  return (
    <div className={`tx-explorer ${compact ? 'tx-explorer-compact' : ''}`}>
      {/* Header */}
      {(title || onClose) && (
        <div className="tx-explorer-header">
          {title && <h3 className="tx-explorer-title">{title}</h3>}
          {onClose && (
            <button className="tx-explorer-close" onClick={onClose} aria-label="Close">×</button>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="tx-explorer-filters">
        <div className="tx-explorer-search-row">
          <div className="tx-explorer-search-wrap">
            <span className="tx-explorer-search-icon">🔍</span>
            <input
              className="input-field tx-explorer-search"
              type="text"
              placeholder="Search transactions..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {search && (
              <button className="tx-explorer-search-clear" onClick={() => setSearch('')}>×</button>
            )}
          </div>
        </div>

        <div className="tx-explorer-filter-row">
          <select className="select-field tx-explorer-select" value={filterType} onChange={e => setFilterType(e.target.value)}>
            <option value="all">All Types</option>
            <option value="income">Income</option>
            <option value="expense">Expense</option>
          </select>

          <select className="select-field tx-explorer-select" value={filterCategory} onChange={e => setFilterCategory(e.target.value)}>
            <option value="all">All Categories</option>
            {allCategories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>

          {!compact && (
            <select className="select-field tx-explorer-select" value={filterAccount} onChange={e => setFilterAccount(e.target.value)}>
              <option value="all">All Accounts</option>
              {accounts.map(a => <option key={a._id} value={a._id}>{a.name}</option>)}
            </select>
          )}

          <select className="select-field tx-explorer-select" value={dateRange} onChange={e => setDateRange(e.target.value)}>
            <option value="all">All Time</option>
            <option value="this-month">This Month</option>
            <option value="last-month">Last Month</option>
            <option value="last-90">Last 90 Days</option>
            <option value="ytd">Year to Date</option>
            <option value="custom">Custom Range</option>
          </select>
        </div>

        {dateRange === 'custom' && (
          <div className="tx-explorer-custom-dates">
            <input className="input-field" type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} />
            <span style={{ color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>to</span>
            <input className="input-field" type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} />
          </div>
        )}
      </div>

      {/* Aggregate Summary */}
      <div className="tx-explorer-summary">
        <div className="tx-explorer-summary-item">
          <span className="tx-explorer-summary-label">Results</span>
          <span className="tx-explorer-summary-value">{aggregates.count}</span>
        </div>
        <div className="tx-explorer-summary-divider" />
        <div className="tx-explorer-summary-item">
          <span className="tx-explorer-summary-label">Income</span>
          <span className="tx-explorer-summary-value" style={{ color: 'var(--color-accent-emerald-light)' }}>
            +{formatCurrency(aggregates.income)}
          </span>
        </div>
        <div className="tx-explorer-summary-divider" />
        <div className="tx-explorer-summary-item">
          <span className="tx-explorer-summary-label">Expenses</span>
          <span className="tx-explorer-summary-value" style={{ color: 'var(--color-accent-rose-light)' }}>
            -{formatCurrency(aggregates.expenses)}
          </span>
        </div>
        <div className="tx-explorer-summary-divider" />
        <div className="tx-explorer-summary-item">
          <span className="tx-explorer-summary-label">Net</span>
          <span className="tx-explorer-summary-value" style={{
            color: aggregates.net >= 0 ? 'var(--color-accent-emerald-light)' : 'var(--color-accent-rose-light)',
            fontWeight: '700',
          }}>
            {aggregates.net >= 0 ? '+' : ''}{formatCurrency(aggregates.net)}
          </span>
        </div>
      </div>

      {/* Transaction List */}
      <div className={`tx-explorer-list ${compact ? 'tx-explorer-list-compact' : ''}`}>
        {displayTx.length > 0 ? (
          displayTx.map((tx, i) => (
            <div key={tx._id || i} className="tx-explorer-row">
              <div className="tx-explorer-row-left">
                <div className={`tx-explorer-icon ${tx.type === 'income' ? 'tx-icon-income' : 'tx-icon-expense'}`}>
                  {tx.type === 'income' ? '↗' : '↘'}
                </div>
                <div className="tx-explorer-row-info">
                  <span className="tx-explorer-row-desc">{tx.description}</span>
                  <span className="tx-explorer-row-meta">
                    {tx.category}
                    {!compact && <> · {getAccountName(tx.accountId)}</>}
                    {' · '}{formatDate(tx.date)}
                  </span>
                </div>
              </div>
              <div className="tx-explorer-row-right">
                <span className={`tx-explorer-row-amount ${tx.type === 'income' ? 'amount-income' : 'amount-expense'}`}>
                  {tx.type === 'income' ? '+' : '-'}{formatCurrency(Math.abs(tx.amount))}
                </span>
                {!compact && onEdit && (
                  <button className="tx-explorer-action-btn" onClick={() => onEdit(tx)} title="Edit">✏️</button>
                )}
                {!compact && onDelete && (
                  <button className="tx-explorer-action-btn" onClick={() => onDelete(tx)} title="Delete">🗑️</button>
                )}
              </div>
            </div>
          ))
        ) : (
          <div className="tx-explorer-empty">
            <p style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>🔎</p>
            <p>No transactions match your filters</p>
          </div>
        )}
        {filtered.length > maxItems && (
          <div style={{ textAlign: 'center', padding: '0.75rem', color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>
            Showing {maxItems} of {filtered.length} results
          </div>
        )}
      </div>
    </div>
  );
}
