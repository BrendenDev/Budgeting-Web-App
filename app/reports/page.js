'use client';

import { useState, useEffect, useCallback } from 'react';
import { useUser } from '@/lib/auth-context';
import AuthGuard from '@/components/AuthGuard';
import Sidebar from '@/components/Sidebar';
import { formatCurrency, getCategoryColor } from '@/lib/calculation-engine';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  BarChart, Bar, PieChart, Pie, Cell, Legend, CartesianGrid, Area, AreaChart,
} from 'recharts';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const FULL_MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function ReportsContent() {
  const { user } = useUser();
  const [snapshots, setSnapshots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [selectedSnapshot, setSelectedSnapshot] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');

  const fetchSnapshots = useCallback(async () => {
    if (!user?.id) return;
    try {
      const res = await fetch(`/api/snapshots?userId=${user.id}`);
      const data = await res.json();
      setSnapshots(Array.isArray(data) ? data : []);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [user?.id]);

  useEffect(() => { fetchSnapshots(); }, [fetchSnapshots]);

  const generateSnapshot = async (month, year) => {
    setGenerating(true);
    try {
      const res = await fetch('/api/snapshots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, month, year }),
      });
      if (res.ok) await fetchSnapshots();
    } catch (e) { console.error(e); }
    setGenerating(false);
  };

  const generateLast6Months = async () => {
    setGenerating(true);
    const now = new Date();
    for (let i = 0; i < 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      await fetch('/api/snapshots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, month: d.getMonth(), year: d.getFullYear() }),
      });
    }
    await fetchSnapshots();
    setGenerating(false);
  };

  // Sort chronologically for charts
  const sorted = [...snapshots].sort((a, b) => {
    if (a.year !== b.year) return a.year - b.year;
    return a.month - b.month;
  });

  // Trend chart data
  const trendData = sorted.map((s) => ({
    label: `${MONTH_NAMES[s.month]} ${s.year}`,
    income: s.totalIncome,
    expenses: s.totalExpenses,
    net: s.netSavings,
    balance: s.totalBalance,
  }));

  // Totals across all snapshots
  const totalIncome = sorted.reduce((s, snap) => s + snap.totalIncome, 0);
  const totalExpenses = sorted.reduce((s, snap) => s + snap.totalExpenses, 0);
  const avgIncome = sorted.length > 0 ? totalIncome / sorted.length : 0;
  const avgExpenses = sorted.length > 0 ? totalExpenses / sorted.length : 0;

  // Aggregate category data across all snapshots
  const aggCategories = {};
  sorted.forEach((s) => {
    (s.categoryBreakdown || []).forEach(({ category, amount }) => {
      aggCategories[category] = (aggCategories[category] || 0) + amount;
    });
  });
  const categoryPieData = Object.entries(aggCategories)
    .map(([name, value], i) => ({ name, value, fill: getCategoryColor(i) }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);

  // Current month snapshot
  const now = new Date();
  const currentSnapshot = snapshots.find(s => s.month === now.getMonth() && s.year === now.getFullYear());

  const tooltipStyle = {
    contentStyle: { background: '#1a2235', border: '1px solid #2a3448', borderRadius: '8px', fontSize: '0.8rem' },
    labelStyle: { color: '#94a3b8' },
  };

  return (
    <div style={{ marginLeft: '260px', padding: '2rem', minHeight: '100vh', background: 'var(--color-bg-primary)' }}>
      {/* Header */}
      <div className="animate-fade-in" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: '700', marginBottom: '0.25rem' }}>Reports</h1>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.85rem' }}>
            Financial trends, monthly snapshots, and spending analysis
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button
            className="btn-secondary"
            onClick={() => generateSnapshot(now.getMonth(), now.getFullYear())}
            disabled={generating}
          >
            {generating ? 'Generating...' : '📸 Snapshot This Month'}
          </button>
          <button className="btn-gradient" onClick={generateLast6Months} disabled={generating}>
            {generating ? 'Generating...' : '📊 Generate Last 6 Months'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="animate-fade-in" style={{ display: 'flex', gap: '0.25rem', marginBottom: '2rem', background: 'var(--color-bg-secondary)', borderRadius: 'var(--radius-md)', padding: '0.25rem', width: 'fit-content' }}>
        {[
          { key: 'overview', label: 'Overview' },
          { key: 'trends', label: 'Trends' },
          { key: 'categories', label: 'Categories' },
          { key: 'snapshots', label: 'Snapshots' },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            style={{
              padding: '0.5rem 1.25rem', borderRadius: 'var(--radius-sm)',
              border: 'none', fontSize: '0.85rem', fontWeight: activeTab === key ? '600' : '400',
              cursor: 'pointer', transition: 'all 0.2s ease',
              background: activeTab === key ? 'var(--color-accent-indigo)' : 'transparent',
              color: activeTab === key ? 'white' : 'var(--color-text-muted)',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
          {[1,2,3,4].map(i => <div key={i} className="skeleton" style={{ height: '200px', borderRadius: 'var(--radius-lg)' }} />)}
        </div>
      ) : snapshots.length === 0 ? (
        <div className="glass-card animate-fade-in" style={{ padding: '3rem', textAlign: 'center' }}>
          <p style={{ fontSize: '3rem', marginBottom: '1rem' }}>📊</p>
          <h3 style={{ fontSize: '1.1rem', fontWeight: '600', marginBottom: '0.5rem' }}>No snapshots yet</h3>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
            Generate monthly snapshots to start tracking your financial trends over time.
          </p>
          <button className="btn-gradient" onClick={generateLast6Months} disabled={generating}>
            {generating ? 'Generating...' : 'Generate Last 6 Months'}
          </button>
        </div>
      ) : (
        <>
          {/* ─── Overview Tab ─────────────────────────────────── */}
          {activeTab === 'overview' && (
            <div className="animate-fade-in">
              {/* Summary Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1.25rem', marginBottom: '2rem' }}>
                <div className="glass-card stat-card-emerald" style={{ padding: '1.25rem 1.5rem' }}>
                  <p style={{ fontSize: '0.7rem', fontWeight: '600', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>Avg Monthly Income</p>
                  <p style={{ fontSize: '1.4rem', fontWeight: '700', color: 'var(--color-accent-emerald-light)' }}>{formatCurrency(avgIncome)}</p>
                </div>
                <div className="glass-card stat-card-rose" style={{ padding: '1.25rem 1.5rem' }}>
                  <p style={{ fontSize: '0.7rem', fontWeight: '600', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>Avg Monthly Expenses</p>
                  <p style={{ fontSize: '1.4rem', fontWeight: '700', color: 'var(--color-accent-rose-light)' }}>{formatCurrency(avgExpenses)}</p>
                </div>
                <div className="glass-card stat-card-indigo" style={{ padding: '1.25rem 1.5rem' }}>
                  <p style={{ fontSize: '0.7rem', fontWeight: '600', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>Avg Net Savings</p>
                  <p style={{ fontSize: '1.4rem', fontWeight: '700', color: avgIncome - avgExpenses >= 0 ? 'var(--color-accent-emerald-light)' : 'var(--color-accent-rose-light)' }}>
                    {formatCurrency(avgIncome - avgExpenses)}
                  </p>
                </div>
                <div className="glass-card stat-card-amber" style={{ padding: '1.25rem 1.5rem' }}>
                  <p style={{ fontSize: '0.7rem', fontWeight: '600', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>Months Tracked</p>
                  <p style={{ fontSize: '1.4rem', fontWeight: '700', color: 'var(--color-accent-amber-light)' }}>{snapshots.length}</p>
                </div>
              </div>

              {/* Income vs Expenses Area Chart */}
              <div className="glass-card" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
                <h2 style={{ fontSize: '1rem', fontWeight: '600', marginBottom: '1.25rem' }}>Income vs Expenses</h2>
                <div style={{ height: '300px' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={trendData}>
                      <defs>
                        <linearGradient id="gradIncome" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="gradExpense" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#f43f5e" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#2a3448" />
                      <XAxis dataKey="label" stroke="#64748b" fontSize={11} tickLine={false} axisLine={{ stroke: '#2a3448' }} />
                      <YAxis stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                      <Tooltip {...tooltipStyle} formatter={(value) => formatCurrency(value)} />
                      <Area type="monotone" dataKey="income" stroke="#10b981" strokeWidth={2} fill="url(#gradIncome)" name="Income" />
                      <Area type="monotone" dataKey="expenses" stroke="#f43f5e" strokeWidth={2} fill="url(#gradExpense)" name="Expenses" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Net Savings Bar Chart + Category Donut */}
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '1.5rem' }}>
                <div className="glass-card" style={{ padding: '1.5rem' }}>
                  <h2 style={{ fontSize: '1rem', fontWeight: '600', marginBottom: '1.25rem' }}>Net Savings by Month</h2>
                  <div style={{ height: '250px' }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={trendData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#2a3448" />
                        <XAxis dataKey="label" stroke="#64748b" fontSize={11} tickLine={false} axisLine={{ stroke: '#2a3448' }} />
                        <YAxis stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => `$${(v / 1000).toFixed(1)}k`} />
                        <Tooltip {...tooltipStyle} formatter={(value) => formatCurrency(value)} />
                        <Bar dataKey="net" name="Net Savings" radius={[4, 4, 0, 0]}>
                          {trendData.map((entry, i) => (
                            <Cell key={i} fill={entry.net >= 0 ? '#10b981' : '#f43f5e'} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="glass-card" style={{ padding: '1.5rem' }}>
                  <h2 style={{ fontSize: '1rem', fontWeight: '600', marginBottom: '1.25rem' }}>Top Spending Categories</h2>
                  {categoryPieData.length > 0 ? (
                    <>
                      <div style={{ height: '170px' }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie data={categoryPieData} cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={3} dataKey="value">
                              {categoryPieData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                            </Pie>
                            <Tooltip {...tooltipStyle} formatter={(value) => formatCurrency(value)} />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginTop: '0.5rem' }}>
                        {categoryPieData.slice(0, 6).map((c, i) => (
                          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: c.fill }} />
                              <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>{c.name}</span>
                            </div>
                            <span style={{ fontSize: '0.75rem', fontWeight: '600', fontFamily: 'var(--font-mono)' }}>{formatCurrency(c.value)}</span>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div style={{ textAlign: 'center', padding: '2rem 0', color: 'var(--color-text-muted)' }}>
                      <p>No spending data available</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ─── Trends Tab ───────────────────────────────────── */}
          {activeTab === 'trends' && (
            <div className="animate-fade-in">
              <div className="glass-card" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
                <h2 style={{ fontSize: '1rem', fontWeight: '600', marginBottom: '1.25rem' }}>Balance Over Time</h2>
                <div style={{ height: '320px' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={trendData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#2a3448" />
                      <XAxis dataKey="label" stroke="#64748b" fontSize={11} tickLine={false} axisLine={{ stroke: '#2a3448' }} />
                      <YAxis stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                      <Tooltip {...tooltipStyle} formatter={(value) => formatCurrency(value)} />
                      <Line type="monotone" dataKey="balance" stroke="#6366f1" strokeWidth={2.5} dot={{ r: 4, fill: '#818cf8', stroke: '#6366f1', strokeWidth: 2 }} name="Total Balance" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                <div className="glass-card" style={{ padding: '1.5rem' }}>
                  <h2 style={{ fontSize: '1rem', fontWeight: '600', marginBottom: '1.25rem' }}>Income Trend</h2>
                  <div style={{ height: '250px' }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={trendData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#2a3448" />
                        <XAxis dataKey="label" stroke="#64748b" fontSize={11} tickLine={false} />
                        <YAxis stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                        <Tooltip {...tooltipStyle} formatter={(value) => formatCurrency(value)} />
                        <Bar dataKey="income" name="Income" fill="#10b981" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="glass-card" style={{ padding: '1.5rem' }}>
                  <h2 style={{ fontSize: '1rem', fontWeight: '600', marginBottom: '1.25rem' }}>Expense Trend</h2>
                  <div style={{ height: '250px' }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={trendData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#2a3448" />
                        <XAxis dataKey="label" stroke="#64748b" fontSize={11} tickLine={false} />
                        <YAxis stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                        <Tooltip {...tooltipStyle} formatter={(value) => formatCurrency(value)} />
                        <Bar dataKey="expenses" name="Expenses" fill="#f43f5e" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ─── Categories Tab ───────────────────────────────── */}
          {activeTab === 'categories' && (
            <div className="animate-fade-in">
              {/* Category Comparison Bar Chart */}
              <div className="glass-card" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
                <h2 style={{ fontSize: '1rem', fontWeight: '600', marginBottom: '1.25rem' }}>Category Spending Comparison</h2>
                <div style={{ height: '350px' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={categoryPieData} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="#2a3448" horizontal={false} />
                      <XAxis type="number" stroke="#64748b" fontSize={11} tickFormatter={(v) => `$${(v / 1000).toFixed(1)}k`} />
                      <YAxis type="category" dataKey="name" stroke="#64748b" fontSize={11} width={100} />
                      <Tooltip {...tooltipStyle} formatter={(value) => formatCurrency(value)} />
                      <Bar dataKey="value" name="Total Spent" radius={[0, 4, 4, 0]}>
                        {categoryPieData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* All categories detail list */}
              <div className="glass-card" style={{ padding: '1.5rem' }}>
                <h2 style={{ fontSize: '1rem', fontWeight: '600', marginBottom: '1rem' }}>Category Details</h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {categoryPieData.map((c, i) => {
                    const pct = totalExpenses > 0 ? (c.value / totalExpenses * 100) : 0;
                    return (
                      <div key={i} style={{
                        padding: '0.875rem 1rem', borderRadius: 'var(--radius-md)',
                        background: 'var(--color-bg-input)', border: '1px solid var(--color-border-default)',
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1 }}>
                          <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: c.fill, flexShrink: 0 }} />
                          <span style={{ fontWeight: '500', fontSize: '0.9rem' }}>{c.name}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                          <div style={{ width: '120px' }}>
                            <div className="progress-bar" style={{ height: '6px' }}>
                              <div className="progress-fill" style={{ width: `${pct}%`, background: c.fill }} />
                            </div>
                          </div>
                          <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', width: '45px', textAlign: 'right' }}>
                            {pct.toFixed(1)}%
                          </span>
                          <span style={{ fontSize: '0.9rem', fontWeight: '600', fontFamily: 'var(--font-mono)', width: '90px', textAlign: 'right' }}>
                            {formatCurrency(c.value)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ─── Snapshots Tab ────────────────────────────────── */}
          {activeTab === 'snapshots' && (
            <div className="animate-fade-in">
              <div className="glass-card" style={{ overflow: 'hidden' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Month</th>
                      <th style={{ textAlign: 'right' }}>Income</th>
                      <th style={{ textAlign: 'right' }}>Expenses</th>
                      <th style={{ textAlign: 'right' }}>Net Savings</th>
                      <th style={{ textAlign: 'right' }}>Balance</th>
                      <th style={{ textAlign: 'center' }}>Txns</th>
                      <th style={{ width: '80px' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.reverse().map((snap) => (
                      <tr key={snap._id}>
                        <td style={{ fontWeight: '500' }}>
                          {FULL_MONTH_NAMES[snap.month]} {snap.year}
                        </td>
                        <td style={{ textAlign: 'right', color: 'var(--color-accent-emerald-light)', fontFamily: 'var(--font-mono)', fontWeight: '600' }}>
                          {formatCurrency(snap.totalIncome)}
                        </td>
                        <td style={{ textAlign: 'right', color: 'var(--color-accent-rose-light)', fontFamily: 'var(--font-mono)', fontWeight: '600' }}>
                          {formatCurrency(snap.totalExpenses)}
                        </td>
                        <td style={{
                          textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: '600',
                          color: snap.netSavings >= 0 ? 'var(--color-accent-emerald-light)' : 'var(--color-accent-rose-light)',
                        }}>
                          {snap.netSavings >= 0 ? '+' : ''}{formatCurrency(snap.netSavings)}
                        </td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>
                          {formatCurrency(snap.totalBalance)}
                        </td>
                        <td style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>
                          {snap.transactionCount}
                        </td>
                        <td>
                          <button
                            onClick={() => generateSnapshot(snap.month, snap.year)}
                            style={{
                              background: 'transparent', border: 'none', cursor: 'pointer',
                              color: 'var(--color-text-muted)', fontSize: '0.8rem',
                            }}
                            title="Refresh snapshot"
                          >
                            🔄
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function ReportsPage() {
  return (
    <AuthGuard>
      <Sidebar />
      <ReportsContent />
    </AuthGuard>
  );
}
