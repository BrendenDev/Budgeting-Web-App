'use client';

import { useState, useEffect, useCallback } from 'react';
import { useUser } from '@/lib/auth-context';
import { useDialog } from '@/components/ConfirmDialog';
import { useCachedFetch } from '@/lib/use-cached-fetch';
import { invalidateCache } from '@/lib/data-cache';
import CategoryPicker from '@/components/CategoryPicker';
import TransactionExplorer from '@/components/TransactionExplorer';
import AuthGuard from '@/components/AuthGuard';
import Sidebar from '@/components/Sidebar';
import Modal from '@/components/Modal';
import { formatCurrency, formatDate } from '@/lib/calculation-engine';
import { getTodayMT, toDateStringMT } from '@/lib/date-utils';
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, TRANSACTION_TYPES } from '@/models/schemas';

function TransactionsContent() {
  const { user } = useUser();
  const { confirm } = useDialog();
  const txUrl = user?.id ? `/api/transactions?userId=${user.id}&limit=500` : null;
  const accountsUrl = user?.id ? `/api/accounts?userId=${user.id}` : null;
  const { data: transactions = [], loading: txLoading, refresh: refreshTransactions } = useCachedFetch(txUrl, { ttl: 30000 });
  const { data: accounts = [], loading: accLoading, refresh: refreshAccounts } = useCachedFetch(accountsUrl, { ttl: 60000 });
  const loading = txLoading || accLoading;
  const [showModal, setShowModal] = useState(false);
  const [editingTx, setEditingTx] = useState(null);
  const [form, setForm] = useState({
    description: '', amount: '', type: 'expense', category: 'Misc',
    date: getTodayMT(), accountId: '', notes: '',
  });
  const [saving, setSaving] = useState(false);

  const openCreate = () => {
    setEditingTx(null);
    setForm({
      description: '', amount: '', type: 'expense', category: 'Misc',
      date: getTodayMT(), accountId: accounts[0]?._id || '', notes: '',
    });
    setShowModal(true);
  };

  const openEdit = (tx) => {
    setEditingTx(tx);
    setForm({
      description: tx.description, amount: String(Math.abs(tx.amount)), type: tx.type,
      category: tx.category, date: toDateStringMT(tx.date),
      accountId: tx.accountId, notes: tx.notes || '',
    });
    setShowModal(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { ...form, amount: Math.abs(Number(form.amount)), userId: user.id };
      if (editingTx) {
        await fetch(`/api/transactions/${editingTx._id}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } else {
        await fetch('/api/transactions', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }
      setShowModal(false);
      invalidateCache('/api/transactions');
      invalidateCache('/api/accounts');
      refreshTransactions();
      refreshAccounts();
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  const handleDelete = async (tx) => {
    const ok = await confirm(`Delete "${tx.description}"?`, {
      title: 'Delete Transaction',
      confirmText: 'Delete',
      variant: 'danger',
      details: [
        `${formatCurrency(tx.amount)} will be reversed from the account balance`,
        'This action cannot be undone',
      ],
    });
    if (!ok) return;
    await fetch(`/api/transactions/${tx._id}`, { method: 'DELETE' });
    invalidateCache('/api/transactions');
    invalidateCache('/api/accounts');
    refreshTransactions();
    refreshAccounts();
  };

  const categories = form.type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

  return (
    <div className="page-container">
      <div className="animate-fade-in" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: '700', marginBottom: '0.25rem' }}>Transactions</h1>
        </div>
        <button className="btn-gradient" onClick={openCreate} id="add-transaction-btn">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 3V13M3 8H13" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
          Add Transaction
        </button>
      </div>

      <div className="glass-card animate-fade-in" style={{ padding: '1.5rem' }}>
        <TransactionExplorer
          transactions={transactions}
          accounts={accounts}
          onEdit={openEdit}
          onDelete={handleDelete}
        />
      </div>

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editingTx ? 'Edit Transaction' : 'New Transaction'}>
        <form onSubmit={handleSave}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '600', color: 'var(--color-text-secondary)', marginBottom: '0.4rem' }}>Description</label>
              <input className="input-field" placeholder="e.g. Grocery shopping" value={form.description} onChange={(e) => setForm({...form, description: e.target.value})} required />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '600', color: 'var(--color-text-secondary)', marginBottom: '0.4rem' }}>Amount</label>
                <input className="input-field" type="number" step="0.01" min="0.01" placeholder="0.00" value={form.amount} onChange={(e) => setForm({...form, amount: e.target.value})} required />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '600', color: 'var(--color-text-secondary)', marginBottom: '0.4rem' }}>Type</label>
                <select className="select-field" value={form.type} onChange={(e) => setForm({...form, type: e.target.value, category: e.target.value === 'income' ? 'Work' : 'Misc'})}>
                  <option value="expense">Expense</option>
                  <option value="income">Income</option>
                </select>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '600', color: 'var(--color-text-secondary)', marginBottom: '0.4rem' }}>Category</label>
                <CategoryPicker
                  categories={categories}
                  value={form.category}
                  onChange={cat => setForm({...form, category: cat})}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '600', color: 'var(--color-text-secondary)', marginBottom: '0.4rem' }}>Date</label>
                <input className="input-field" type="date" value={form.date} onChange={(e) => setForm({...form, date: e.target.value})} required />
              </div>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '600', color: 'var(--color-text-secondary)', marginBottom: '0.4rem' }}>Account</label>
              <select className="select-field" value={form.accountId} onChange={(e) => setForm({...form, accountId: e.target.value})} required>
                <option value="">Select account</option>
                {accounts.map(a => <option key={a._id} value={a._id}>{a.name}</option>)}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '600', color: 'var(--color-text-secondary)', marginBottom: '0.4rem' }}>Notes (Optional)</label>
              <input className="input-field" placeholder="Any additional notes..." value={form.notes} onChange={(e) => setForm({...form, notes: e.target.value})} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem', justifyContent: 'flex-end' }}>
            <button type="button" className="btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
            <button type="submit" className="btn-gradient" disabled={saving}>
              {saving ? 'Saving...' : editingTx ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

export default function TransactionsPage() {
  return (
    <AuthGuard>
      <Sidebar />
      <TransactionsContent />
    </AuthGuard>
  );
}
