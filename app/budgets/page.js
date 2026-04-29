'use client';

import { useState, useEffect, useCallback } from 'react';
import { useUser } from '@/lib/auth-context';
import AuthGuard from '@/components/AuthGuard';
import Sidebar from '@/components/Sidebar';
import Modal from '@/components/Modal';
import { formatCurrency } from '@/lib/calculation-engine';
import { EXPENSE_CATEGORIES } from '@/models/schemas';

function BudgetsContent() {
  const { user } = useUser();
  const [budgets, setBudgets] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingBudget, setEditingBudget] = useState(null);
  const [form, setForm] = useState({ category: EXPENSE_CATEGORIES[0], monthlyLimit: '' });
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    if (!user?.id) return;
    try {
      // Get current month's transactions for spending
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString();

      const [budgetRes, txRes] = await Promise.all([
        fetch(`/api/budgets?userId=${user.id}`),
        fetch(`/api/transactions?userId=${user.id}&type=expense&startDate=${startOfMonth}&endDate=${endOfMonth}&limit=500`),
      ]);
      setBudgets(await budgetRes.json());
      setTransactions(await txRes.json());
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [user?.id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const getSpentForCategory = (category) => {
    return transactions
      .filter(tx => tx.category === category && tx.type === 'expense')
      .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
  };

  const openCreate = () => {
    setEditingBudget(null);
    const usedCategories = budgets.map(b => b.category);
    const available = EXPENSE_CATEGORIES.filter(c => !usedCategories.includes(c));
    setForm({ category: available[0] || EXPENSE_CATEGORIES[0], monthlyLimit: '' });
    setShowModal(true);
  };

  const openEdit = (budget) => {
    setEditingBudget(budget);
    setForm({ category: budget.category, monthlyLimit: String(budget.monthlyLimit) });
    setShowModal(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editingBudget) {
        await fetch(`/api/budgets/${editingBudget._id}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        });
      } else {
        await fetch('/api/budgets', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...form, userId: user.id }),
        });
      }
      setShowModal(false);
      fetchData();
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this budget?')) return;
    await fetch(`/api/budgets/${id}`, { method: 'DELETE' });
    fetchData();
  };

  const totalBudgeted = budgets.reduce((sum, b) => sum + (b.monthlyLimit || 0), 0);
  const totalSpent = budgets.reduce((sum, b) => sum + getSpentForCategory(b.category), 0);

  const usedCategories = budgets.map(b => b.category);
  const availableCategories = editingBudget
    ? EXPENSE_CATEGORIES
    : EXPENSE_CATEGORIES.filter(c => !usedCategories.includes(c));

  return (
    <div style={{ marginLeft: '260px', padding: '2rem', minHeight: '100vh', background: 'var(--color-bg-primary)' }}>
      <div className="animate-fade-in" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: '700', marginBottom: '0.25rem' }}>Budgets</h1>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.85rem' }}>
            Set monthly spending limits by category
          </p>
        </div>
        <button className="btn-gradient" onClick={openCreate} id="add-budget-btn">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 3V13M3 8H13" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
          Add Budget
        </button>
      </div>

      {/* Summary Cards */}
      {budgets.length > 0 && (
        <div className="animate-fade-in" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.25rem', marginBottom: '2rem' }}>
          <div className="glass-card stat-card-indigo" style={{ padding: '1.25rem 1.5rem' }}>
            <p style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>Total Budgeted</p>
            <p style={{ fontSize: '1.4rem', fontWeight: '700', color: 'var(--color-accent-indigo-light)' }}>
              {formatCurrency(totalBudgeted)}
            </p>
          </div>
          <div className="glass-card stat-card-rose" style={{ padding: '1.25rem 1.5rem' }}>
            <p style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>Total Spent</p>
            <p style={{ fontSize: '1.4rem', fontWeight: '700', color: 'var(--color-accent-rose-light)' }}>
              {formatCurrency(totalSpent)}
            </p>
          </div>
          <div className="glass-card stat-card-emerald" style={{ padding: '1.25rem 1.5rem' }}>
            <p style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>Remaining</p>
            <p style={{
              fontSize: '1.4rem', fontWeight: '700',
              color: totalBudgeted - totalSpent >= 0 ? 'var(--color-accent-emerald-light)' : 'var(--color-accent-rose-light)',
            }}>
              {formatCurrency(totalBudgeted - totalSpent)}
            </p>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {[1,2,3].map(i => <div key={i} className="skeleton" style={{ height: '90px', borderRadius: 'var(--radius-lg)' }} />)}
        </div>
      ) : budgets.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {budgets.map((budget) => {
            const spent = getSpentForCategory(budget.category);
            const percentage = budget.monthlyLimit > 0 ? Math.min((spent / budget.monthlyLimit) * 100, 100) : 0;
            const isOver = spent > budget.monthlyLimit;

            return (
              <div key={budget._id} className="glass-card animate-fade-in" style={{ padding: '1.25rem 1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <div>
                    <p style={{ fontWeight: '600', fontSize: '0.95rem', marginBottom: '0.15rem' }}>{budget.category}</p>
                    <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                      {formatCurrency(spent)} of {formatCurrency(budget.monthlyLimit)} spent
                    </p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <span className={`badge ${isOver ? 'badge-rose' : percentage > 75 ? 'badge-amber' : 'badge-emerald'}`}>
                      {percentage.toFixed(0)}%
                    </span>
                    <div style={{ display: 'flex', gap: '0.25rem' }}>
                      <button onClick={() => openEdit(budget)} style={{ background: 'transparent', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', fontSize: '0.85rem' }}>✏️</button>
                      <button onClick={() => handleDelete(budget._id)} style={{ background: 'transparent', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', fontSize: '0.85rem' }}>🗑️</button>
                    </div>
                  </div>
                </div>
                <div className="progress-bar">
                  <div className="progress-fill" style={{
                    width: `${percentage}%`,
                    background: isOver
                      ? 'linear-gradient(90deg, var(--color-accent-rose), var(--color-accent-rose-light))'
                      : percentage > 75
                        ? 'linear-gradient(90deg, var(--color-accent-amber), var(--color-accent-amber-light))'
                        : 'linear-gradient(90deg, var(--color-accent-emerald), var(--color-accent-emerald-light))',
                  }} />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="glass-card" style={{ padding: '3rem', textAlign: 'center' }}>
          <p style={{ fontSize: '3rem', marginBottom: '1rem' }}>📊</p>
          <h3 style={{ fontSize: '1.1rem', fontWeight: '600', marginBottom: '0.5rem' }}>No budgets set</h3>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
            Set monthly spending limits to keep your finances on track.
          </p>
          <button className="btn-gradient" onClick={openCreate}>Create Your First Budget</button>
        </div>
      )}

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editingBudget ? 'Edit Budget' : 'New Budget'}>
        <form onSubmit={handleSave}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '600', color: 'var(--color-text-secondary)', marginBottom: '0.4rem' }}>Category</label>
              <select className="select-field" value={form.category} onChange={(e) => setForm({...form, category: e.target.value})} disabled={!!editingBudget}>
                {availableCategories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '600', color: 'var(--color-text-secondary)', marginBottom: '0.4rem' }}>Monthly Limit</label>
              <input className="input-field" type="number" step="0.01" min="0.01" placeholder="500.00" value={form.monthlyLimit} onChange={(e) => setForm({...form, monthlyLimit: e.target.value})} required />
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem', justifyContent: 'flex-end' }}>
            <button type="button" className="btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
            <button type="submit" className="btn-gradient" disabled={saving}>
              {saving ? 'Saving...' : editingBudget ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

export default function BudgetsPage() {
  return (
    <AuthGuard>
      <Sidebar />
      <BudgetsContent />
    </AuthGuard>
  );
}
