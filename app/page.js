'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useUser } from '@/lib/auth-context';
import AuthGuard from '@/components/AuthGuard';
import Sidebar from '@/components/Sidebar';
import Modal from '@/components/Modal';
import { useDialog } from '@/components/ConfirmDialog';
import CategoryPicker from '@/components/CategoryPicker';
import { formatCurrency, formatDate, projectBalances, calculateMonthlySummary, getCategoryColor } from '@/lib/calculation-engine';
import { getTodayMT, getCurrentMonthMT, getCurrentYearMT } from '@/lib/date-utils';
import { ACCOUNT_TYPES, EXPENSE_CATEGORIES, INCOME_CATEGORIES, TRANSACTION_TYPES } from '@/models/schemas';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar } from 'recharts';

function DashboardContent() {
  const { user } = useUser();
  const { alert: showAlert } = useDialog();
  const [accounts, setAccounts] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [rules, setRules] = useState([]);
  const [budgets, setBudgets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [projectionDays, setProjectionDays] = useState(90);
  const [syncStatus, setSyncStatus] = useState(null);

  // Quick-add transaction state
  const [quickForm, setQuickForm] = useState({
    description: '', amount: '', type: 'expense', category: 'Misc',
    date: getTodayMT(), accountId: '',
  });
  const [quickSaving, setQuickSaving] = useState(false);
  const [quickSuccess, setQuickSuccess] = useState(false);

  const handleQuickAdd = async (e) => {
    e.preventDefault();
    setQuickSaving(true);
    try {
      const payload = { ...quickForm, amount: Math.abs(Number(quickForm.amount)), userId: user.id };
      const res = await fetch('/api/transactions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setQuickForm({ description: '', amount: '', type: quickForm.type, category: quickForm.type === 'income' ? 'Work' : 'Misc', date: getTodayMT(), accountId: quickForm.accountId });
        setQuickSuccess(true);
        setTimeout(() => setQuickSuccess(false), 2000);
        fetchData();
      }
    } catch (err) { console.error(err); }
    setQuickSaving(false);
  };

  const fetchData = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const [accRes, txRes, rulesRes, budgetRes] = await Promise.all([
        fetch(`/api/accounts?userId=${user.id}`),
        fetch(`/api/transactions?userId=${user.id}&limit=200`),
        fetch(`/api/recurring?userId=${user.id}`),
        fetch(`/api/budgets?userId=${user.id}`),
      ]);
      const accData = await accRes.json();
      const txData = await txRes.json();
      const rulesData = await rulesRes.json();
      const budgetData = await budgetRes.json();
      const safeAccounts = Array.isArray(accData) ? accData : [];
      setAccounts(safeAccounts);
      setTransactions(Array.isArray(txData) ? txData : []);
      setRules(Array.isArray(rulesData) ? rulesData : []);
      setBudgets(Array.isArray(budgetData) ? budgetData : []);
      // Auto-select first account for quick-add if none selected
      if (safeAccounts.length > 0 && !quickForm.accountId) {
        setQuickForm(prev => ({ ...prev, accountId: safeAccounts[0]._id }));
      }
    } catch (e) {
      console.error('Failed to fetch data:', e);
    }
    setLoading(false);
  }, [user?.id]);

  // Process recurring rules on mount, then fetch data
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;

    async function syncAndFetch() {
      // First, materialize any missed recurring rule occurrences
      setSyncStatus('syncing');
      try {
        const res = await fetch('/api/recurring/process', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: user.id }),
        });
        const result = await res.json();
        if (!cancelled) {
          if (res.ok && result.totalCreated > 0) {
            setSyncStatus({ created: result.totalCreated });
            // Auto-dismiss after 4 seconds
            setTimeout(() => setSyncStatus(null), 4000);
          } else {
            setSyncStatus(null);
          }
        }
      } catch (e) {
        console.error('Rule sync failed:', e);
        if (!cancelled) setSyncStatus(null);
      }

      // Then fetch all data (with newly created transactions included)
      if (!cancelled) await fetchData();
    }

    syncAndFetch();
    return () => { cancelled = true; };
  }, [user?.id, fetchData]);

  // Projections — only recompute when dependencies change, not on every render
  const projection = useMemo(
    () => projectBalances(accounts, rules, projectionDays),
    [accounts, rules, projectionDays]
  );

  const monthlySummary = useMemo(() => {
    return calculateMonthlySummary(transactions, getCurrentMonthMT(), getCurrentYearMT());
  }, [transactions]);

  // Chart data — derived from projection, only recomputed when projection changes
  const chartData = useMemo(() => {
    const dp = projection.dailyProjection;
    const step = Math.max(1, Math.floor(dp.length / 30));
    return dp
      .filter((_, i) => i % step === 0 || i === dp.length - 1)
      .map((d) => ({
        date: new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        balance: Number(d.totalBalance.toFixed(2)),
      }));
  }, [projection]);

  const totalBalance = useMemo(
    () => accounts.reduce((sum, a) => sum + (a.balance || 0), 0),
    [accounts]
  );

  const recentTx = useMemo(
    () => Array.isArray(transactions) ? transactions.slice(0, 5) : [],
    [transactions]
  );

  // Category pie data — derived from monthlySummary
  const pieData = useMemo(
    () => monthlySummary.categoryBreakdown.slice(0, 8).map((c, i) => ({
      name: c.category,
      value: c.amount,
      fill: getCategoryColor(i),
    })),
    [monthlySummary]
  );

  if (loading) {
    return (
      <div className="page-container">
        <div className="stat-grid">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="skeleton" style={{ height: '120px', borderRadius: 'var(--radius-lg)' }} />
          ))}
        </div>
        <div className="chart-grid">
          <div className="skeleton" style={{ height: '320px', borderRadius: 'var(--radius-lg)' }} />
          <div className="skeleton" style={{ height: '320px', borderRadius: 'var(--radius-lg)' }} />
        </div>
      </div>
    );
  }

  return (
    <div className="page-container">
      {/* Sync Status Banner */}
      {syncStatus && (
        <div className="animate-fade-in" style={{
          marginBottom: '1rem', padding: '0.75rem 1.25rem', borderRadius: 'var(--radius-md)',
          display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '0.85rem',
          background: syncStatus === 'syncing' ? 'rgba(99, 102, 241, 0.1)' : 'rgba(16, 185, 129, 0.1)',
          border: `1px solid ${syncStatus === 'syncing' ? 'rgba(99, 102, 241, 0.2)' : 'rgba(16, 185, 129, 0.2)'}`,
          color: syncStatus === 'syncing' ? 'var(--color-accent-indigo-light)' : 'var(--color-accent-emerald-light)',
        }}>
          {syncStatus === 'syncing' ? (
            <><span style={{ display: 'inline-block', animation: 'spin 1s linear infinite', fontSize: '1rem' }}>⟳</span> Syncing recurring transactions...</>
          ) : (
            <><span style={{ fontSize: '1rem' }}>✅</span> Synced — created {syncStatus.created} transaction{syncStatus.created !== 1 ? 's' : ''} from recurring items</>
          )}
          {syncStatus !== 'syncing' && (
            <button onClick={() => setSyncStatus(null)} style={{
              marginLeft: 'auto', background: 'none', border: 'none', color: 'inherit',
              cursor: 'pointer', fontSize: '1rem', lineHeight: 1,
            }}>×</button>
          )}
        </div>
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* ── Quick Add Hub ────────────────────────────── */}
      <div className="glass-card animate-fade-in" style={{
        padding: '1.25rem 1.5rem', marginBottom: '1.5rem',
        position: 'relative', zIndex: 10,
        border: '1px solid rgba(99, 102, 241, 0.15)',
        background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.04) 0%, rgba(16, 185, 129, 0.02) 100%)',
      }}>
        <form onSubmit={handleQuickAdd}>
          {/* Title row + type toggle */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <span style={{ fontSize: '1.1rem' }}>⚡</span>
              <h2 style={{ fontSize: '0.95rem', fontWeight: '700' }}>Quick Add</h2>
              {quickSuccess && (
                <span className="animate-fade-in" style={{
                  fontSize: '0.75rem', fontWeight: '600', color: 'var(--color-accent-emerald-light)',
                  background: 'rgba(16, 185, 129, 0.1)', padding: '0.2rem 0.6rem',
                  borderRadius: 'var(--radius-sm)', border: '1px solid rgba(16, 185, 129, 0.2)',
                }}>✓ Added!</span>
              )}
            </div>
            <div style={{
              display: 'flex', borderRadius: 'var(--radius-sm)', overflow: 'hidden',
              border: '1px solid var(--color-border-default)',
            }}>
              {['expense', 'income'].map(t => (
                <button key={t} type="button" onClick={() => setQuickForm({...quickForm, type: t, category: t === 'income' ? 'Work' : 'Misc'})} style={{
                  padding: '0.35rem 0.85rem', fontSize: '0.75rem', fontWeight: '600',
                  border: 'none', cursor: 'pointer', transition: 'all 0.2s ease',
                  background: quickForm.type === t
                    ? (t === 'expense' ? 'var(--color-accent-rose)' : 'var(--color-accent-emerald)')
                    : 'transparent',
                  color: quickForm.type === t ? 'white' : 'var(--color-text-muted)',
                }}>
                  {t === 'expense' ? '↘ Expense' : '↗ Income'}
                </button>
              ))}
            </div>
          </div>

          {/* Input row */}
          <div className="quick-add-grid">
            <input className="input-field" placeholder="What did you spend on?" value={quickForm.description} onChange={e => setQuickForm({...quickForm, description: e.target.value})} required style={{ fontSize: '0.85rem', padding: '0.55rem 0.75rem' }} />
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: '0.65rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)', fontSize: '0.85rem', pointerEvents: 'none' }}>$</span>
              <input className="input-field" type="number" step="0.01" min="0.01" placeholder="0.00" value={quickForm.amount} onChange={e => setQuickForm({...quickForm, amount: e.target.value})} required style={{ fontSize: '0.85rem', padding: '0.55rem 0.75rem 0.55rem 1.4rem', width: '100%' }} />
            </div>
            <CategoryPicker
              categories={quickForm.type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES}
              value={quickForm.category}
              onChange={cat => setQuickForm({...quickForm, category: cat})}
            />
            <select className="select-field" value={quickForm.accountId} onChange={e => setQuickForm({...quickForm, accountId: e.target.value})} required style={{ fontSize: '0.85rem', padding: '0.55rem 0.75rem' }}>
              {accounts.length > 1 && <option value="">Account</option>}
              {accounts.map(a => <option key={a._id} value={a._id}>{a.name}</option>)}
            </select>
            <input className="input-field" type="date" value={quickForm.date} onChange={e => setQuickForm({...quickForm, date: e.target.value})} required style={{ fontSize: '0.85rem', padding: '0.55rem 0.75rem' }} />
            <button type="submit" disabled={quickSaving} className="btn-gradient" style={{
              padding: '0.55rem 1.25rem', fontSize: '0.85rem', minWidth: 'auto',
              opacity: quickSaving ? 0.7 : 1,
            }}>
              {quickSaving ? '...' : 'Add'}
            </button>
          </div>
        </form>
      </div>

      {/* Stat Cards */}
      <div className="stat-grid animate-fade-in">
        <div className="glass-card stat-card-emerald" style={{ padding: '1.25rem 1.5rem' }}>
          <p style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
            Total Balance
          </p>
          <p style={{ fontSize: '1.6rem', fontWeight: '700', color: 'var(--color-accent-emerald-light)' }}>
            {formatCurrency(totalBalance)}
          </p>
          <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '0.25rem' }}>
            Across {accounts.length} account{accounts.length !== 1 ? 's' : ''}
          </p>
        </div>

        <div className="glass-card stat-card-indigo" style={{ padding: '1.25rem 1.5rem' }}>
          <p style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
            Projected ({projectionDays}d)
          </p>
          <p style={{ fontSize: '1.6rem', fontWeight: '700', color: 'var(--color-accent-indigo-light)' }}>
            {formatCurrency(projection.projectedBalance)}
          </p>
          <p style={{
            fontSize: '0.75rem',
            marginTop: '0.25rem',
            color: projection.netCashFlow >= 0 ? 'var(--color-accent-emerald)' : 'var(--color-accent-rose)',
          }}>
            {projection.netCashFlow >= 0 ? '↑' : '↓'} {formatCurrency(Math.abs(projection.netCashFlow))} net
          </p>
        </div>

        <div className="glass-card stat-card-rose" style={{ padding: '1.25rem 1.5rem' }}>
          <p style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
            Monthly Expenses
          </p>
          <p style={{ fontSize: '1.6rem', fontWeight: '700', color: 'var(--color-accent-rose-light)' }}>
            {formatCurrency(monthlySummary.expenses)}
          </p>
          <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '0.25rem' }}>
            {monthlySummary.expenseCount} expense{monthlySummary.expenseCount !== 1 ? 's' : ''} this month
          </p>
        </div>

        <div className="glass-card stat-card-amber" style={{ padding: '1.25rem 1.5rem' }}>
          <p style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
            Monthly Income
          </p>
          <p style={{ fontSize: '1.6rem', fontWeight: '700', color: 'var(--color-accent-amber-light)' }}>
            {formatCurrency(monthlySummary.income)}
          </p>
          <p style={{
            fontSize: '0.75rem',
            marginTop: '0.25rem',
            color: monthlySummary.net >= 0 ? 'var(--color-accent-emerald)' : 'var(--color-accent-rose)',
          }}>
            Net: {formatCurrency(monthlySummary.net)}
          </p>
        </div>
      </div>

      {/* Charts Row */}
      <div className="chart-grid" style={{ marginBottom: '2rem' }}>
        {/* Balance Projection Chart */}
        <div className="glass-card animate-fade-in" style={{ padding: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <h2 style={{ fontSize: '1rem', fontWeight: '600' }}>Balance Projection</h2>
            <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
              {[30, 60, 90, 180, 365].map((d) => (
                <button
                  key={d}
                  onClick={() => setProjectionDays(d)}
                  style={{
                    padding: '0.3rem 0.7rem',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid',
                    borderColor: projectionDays === d ? 'var(--color-accent-indigo)' : 'var(--color-border-default)',
                    background: projectionDays === d ? 'rgba(99, 102, 241, 0.15)' : 'transparent',
                    color: projectionDays === d ? 'var(--color-accent-indigo-light)' : 'var(--color-text-muted)',
                    fontSize: '0.7rem',
                    fontWeight: '600',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                  }}
                >
                  {d}d
                </button>
              ))}
            </div>
          </div>
          <div style={{ height: '280px' }}>
            {chartData.length > 1 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <XAxis
                    dataKey="date"
                    stroke="#64748b"
                    fontSize={11}
                    tickLine={false}
                    axisLine={{ stroke: '#2a3448' }}
                  />
                  <YAxis
                    stroke="#64748b"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                  />
                  <Tooltip
                    contentStyle={{
                      background: '#1a2235',
                      border: '1px solid #2a3448',
                      borderRadius: '8px',
                      fontSize: '0.85rem',
                    }}
                    labelStyle={{ color: '#94a3b8' }}
                    formatter={(value) => [formatCurrency(value), 'Balance']}
                  />
                  <Line
                    type="monotone"
                    dataKey="balance"
                    stroke="#6366f1"
                    strokeWidth={2.5}
                    dot={false}
                    activeDot={{ r: 5, fill: '#818cf8', stroke: '#6366f1', strokeWidth: 2 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
                <div style={{ textAlign: 'center' }}>
                  <p style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📊</p>
                  <p>Add accounts and rules to see projections</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Category Breakdown */}
        <div className="glass-card animate-fade-in" style={{ padding: '1.5rem' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: '600', marginBottom: '1.25rem' }}>Spending by Category</h2>
          {pieData.length > 0 ? (
            <>
              <div style={{ height: '180px' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={75}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        background: '#1a2235',
                        border: '1px solid #2a3448',
                        borderRadius: '8px',
                        fontSize: '0.8rem',
                      }}
                      formatter={(value) => formatCurrency(value)}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.75rem' }}>
                {pieData.slice(0, 5).map((c, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: c.fill }} />
                      <span style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>{c.name}</span>
                    </div>
                    <span style={{ fontSize: '0.8rem', fontWeight: '600', fontFamily: 'var(--font-mono)' }}>
                      {formatCurrency(c.value)}
                    </span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '200px', color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
              <div style={{ textAlign: 'center' }}>
                <p style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🍰</p>
                <p>No expenses this month yet</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Row: Recent Transactions + Accounts */}
      <div className="chart-grid">
        {/* Recent Transactions */}
        <div className="glass-card animate-fade-in" style={{ padding: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2 style={{ fontSize: '1rem', fontWeight: '600' }}>Recent Transactions</h2>
            <a href="/transactions" style={{ fontSize: '0.8rem', color: 'var(--color-accent-indigo-light)', textDecoration: 'none' }}>
              View all →
            </a>
          </div>

          {recentTx.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {recentTx.map((tx, i) => (
                <div key={tx._id || i} style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '0.75rem 0',
                  borderBottom: i < recentTx.length - 1 ? '1px solid rgba(42, 52, 72, 0.5)' : 'none',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '8px',
                      background: tx.type === 'income' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(244, 63, 94, 0.1)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '0.9rem',
                    }}>
                      {tx.type === 'income' ? '↗' : '↘'}
                    </div>
                    <div>
                      <p style={{ fontSize: '0.85rem', fontWeight: '500' }}>{tx.description}</p>
                      <p style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>
                        {tx.category} · {formatDate(tx.date)}
                      </p>
                    </div>
                  </div>
                  <span style={{
                    fontSize: '0.9rem',
                    fontWeight: '600',
                    fontFamily: 'var(--font-mono)',
                    color: tx.type === 'income' ? 'var(--color-accent-emerald-light)' : 'var(--color-accent-rose-light)',
                  }}>
                    {tx.type === 'income' ? '+' : '-'}{formatCurrency(Math.abs(tx.amount))}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '2rem 0', color: 'var(--color-text-muted)' }}>
              <p style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>💸</p>
              <p style={{ fontSize: '0.85rem' }}>No transactions yet. Start by adding accounts!</p>
            </div>
          )}
        </div>

        {/* Accounts Overview */}
        <div className="glass-card animate-fade-in" style={{ padding: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2 style={{ fontSize: '1rem', fontWeight: '600' }}>Accounts</h2>
            <a href="/accounts" style={{ fontSize: '0.8rem', color: 'var(--color-accent-indigo-light)', textDecoration: 'none' }}>
              Manage →
            </a>
          </div>
          {accounts.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {accounts.map((acc) => (
                <div key={acc._id} style={{
                  padding: '0.875rem 1rem',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--color-bg-input)',
                  border: '1px solid var(--color-border-default)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}>
                  <div>
                    <p style={{ fontSize: '0.85rem', fontWeight: '600' }}>{acc.name}</p>
                    <p style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', textTransform: 'capitalize' }}>
                      {acc.type}{acc.institution ? ` · ${acc.institution}` : ''}
                    </p>
                  </div>
                  <span style={{
                    fontSize: '1rem',
                    fontWeight: '700',
                    fontFamily: 'var(--font-mono)',
                    color: acc.balance >= 0 ? 'var(--color-accent-emerald-light)' : 'var(--color-accent-rose-light)',
                  }}>
                    {formatCurrency(acc.balance)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '2rem 0', color: 'var(--color-text-muted)' }}>
              <p style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🏦</p>
              <p style={{ fontSize: '0.85rem' }}>No accounts yet. Head to Accounts to add one!</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <AuthGuard>
      <Sidebar />
      <DashboardContent />
    </AuthGuard>
  );
}
