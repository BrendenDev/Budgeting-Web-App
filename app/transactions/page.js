'use client';

import { useState, useEffect, useCallback } from 'react';
import { useUser } from '@/lib/auth-context';
import { useDialog } from '@/components/ConfirmDialog';
import CategoryPicker from '@/components/CategoryPicker';
import AuthGuard from '@/components/AuthGuard';
import Sidebar from '@/components/Sidebar';
import Modal from '@/components/Modal';
import { formatCurrency, formatDate } from '@/lib/calculation-engine';
import { getTodayMT } from '@/lib/date-utils';
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, TRANSACTION_TYPES } from '@/models/schemas';

function TransactionsContent() {
  const { user } = useUser();
  const { confirm } = useDialog();
  const [transactions, setTransactions] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingTx, setEditingTx] = useState(null);
  const [form, setForm] = useState({
    description: '', amount: '', type: 'expense', category: 'Misc',
    date: getTodayMT(), accountId: '', notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [filterType, setFilterType] = useState('all');
  const [filterAccount, setFilterAccount] = useState('all');

  const fetchData = useCallback(async () => {
    if (!user?.id) return;
    try {
      const [txRes, accRes] = await Promise.all([
        fetch(`/api/transactions?userId=${user.id}&limit=200`),
        fetch(`/api/accounts?userId=${user.id}`),
      ]);
      const txData = await txRes.json();
      const accData = await accRes.json();
      setTransactions(Array.isArray(txData) ? txData : []);
      setAccounts(Array.isArray(accData) ? accData : []);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [user?.id]);

  useEffect(() => { fetchData(); }, [fetchData]);

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
      category: tx.category, date: new Date(tx.date).toISOString().split('T')[0],
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
      fetchData();
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
    fetchData();
  };

  const categories = form.type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

  const filtered = transactions.filter((tx) => {
    if (filterType !== 'all' && tx.type !== filterType) return false;
    if (filterAccount !== 'all' && tx.accountId !== filterAccount) return false;
    return true;
  });

  const getAccountName = (id) => accounts.find(a => a._id === id)?.name || 'Unknown';

  return (
    <div className="page-container">
      <div className="animate-fade-in" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: '700', marginBottom: '0.25rem' }}>Transactions</h1>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.85rem' }}>
            {filtered.length} transaction{filtered.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button className="btn-gradient" onClick={openCreate} id="add-transaction-btn">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 3V13M3 8H13" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
          Add Transaction
        </button>
      </div>

      {/* Filters */}
      <div className="animate-fade-in" style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <select className="select-field" style={{ width: 'auto', minWidth: '130px', flex: '1 1 auto' }} value={filterType} onChange={(e) => setFilterType(e.target.value)}>
          <option value="all">All Types</option>
          <option value="income">Income</option>
          <option value="expense">Expense</option>
        </select>
        <select className="select-field" style={{ width: 'auto', minWidth: '160px', flex: '1 1 auto' }} value={filterAccount} onChange={(e) => setFilterAccount(e.target.value)}>
          <option value="all">All Accounts</option>
          {accounts.map(a => <option key={a._id} value={a._id}>{a.name}</option>)}
        </select>
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {[1,2,3,4,5].map(i => <div key={i} className="skeleton" style={{ height: '60px', borderRadius: 'var(--radius-md)' }} />)}
        </div>
      ) : filtered.length > 0 ? (
        <div className="glass-card animate-fade-in" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Description</th>
                <th>Category</th>
                <th>Account</th>
                <th>Date</th>
                <th style={{ textAlign: 'right' }}>Amount</th>
                <th style={{ width: '80px' }}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((tx) => (
                <tr key={tx._id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <div style={{
                        width: '28px', height: '28px', borderRadius: '6px',
                        background: tx.type === 'income' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(244, 63, 94, 0.1)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem',
                        flexShrink: 0,
                      }}>
                        {tx.type === 'income' ? '↗' : '↘'}
                      </div>
                      <span style={{ fontWeight: '500' }}>{tx.description}</span>
                    </div>
                  </td>
                  <td>
                    <span className={`badge ${tx.type === 'income' ? 'badge-emerald' : 'badge-rose'}`}>
                      {tx.category}
                    </span>
                  </td>
                  <td style={{ color: 'var(--color-text-secondary)', fontSize: '0.8rem' }}>{getAccountName(tx.accountId)}</td>
                  <td style={{ color: 'var(--color-text-secondary)', fontSize: '0.8rem' }}>{formatDate(tx.date)}</td>
                  <td style={{
                    textAlign: 'right', fontWeight: '600', fontFamily: 'var(--font-mono)',
                    color: tx.type === 'income' ? 'var(--color-accent-emerald-light)' : 'var(--color-accent-rose-light)',
                  }}>
                    {tx.type === 'income' ? '+' : '-'}{formatCurrency(Math.abs(tx.amount))}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.25rem', justifyContent: 'flex-end' }}>
                      <button onClick={() => openEdit(tx)} style={{ background: 'transparent', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', fontSize: '0.8rem' }}>✏️</button>
                      <button onClick={() => handleDelete(tx)} style={{ background: 'transparent', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', fontSize: '0.8rem' }}>🗑️</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="glass-card" style={{ padding: '3rem', textAlign: 'center' }}>
          <p style={{ fontSize: '3rem', marginBottom: '1rem' }}>💸</p>
          <h3 style={{ fontSize: '1.1rem', fontWeight: '600', marginBottom: '0.5rem' }}>No transactions yet</h3>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
            Record your first transaction to start tracking your spending.
          </p>
          <button className="btn-gradient" onClick={openCreate}>Add Transaction</button>
        </div>
      )}

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
