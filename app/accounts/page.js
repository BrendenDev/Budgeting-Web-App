'use client';

import { useState, useEffect, useCallback } from 'react';
import { useUser } from '@/lib/auth-context';
import AuthGuard from '@/components/AuthGuard';
import Sidebar from '@/components/Sidebar';
import Modal from '@/components/Modal';
import { formatCurrency } from '@/lib/calculation-engine';
import { ACCOUNT_TYPES } from '@/models/schemas';
import { useCachedFetch } from '@/lib/use-cached-fetch';
import { invalidateCache } from '@/lib/data-cache';

function AccountsContent() {
  const { user } = useUser();
  const [showModal, setShowModal] = useState(false);
  const [editingAccount, setEditingAccount] = useState(null);
  const [form, setForm] = useState({ name: '', type: 'checking', balance: '', institution: '' });
  const [saving, setSaving] = useState(false);

  const accountsUrl = user?.id ? `/api/accounts?userId=${user.id}` : null;
  const { data: accounts = [], loading, refresh: refreshAccounts } = useCachedFetch(accountsUrl, { ttl: 60000 });

  const openCreate = () => {
    setEditingAccount(null);
    setForm({ name: '', type: 'checking', balance: '', institution: '' });
    setShowModal(true);
  };

  const openEdit = (acc) => {
    setEditingAccount(acc);
    setForm({ name: acc.name, type: acc.type, balance: String(acc.balance), institution: acc.institution || '' });
    setShowModal(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editingAccount) {
        await fetch(`/api/accounts/${editingAccount._id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        });
      } else {
        await fetch('/api/accounts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...form, userId: user.id }),
        });
      }
      setShowModal(false);
      invalidateCache('/api/accounts');
      refreshAccounts();
    } catch (e) {
      console.error(e);
    }
    setSaving(false);
  };

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this account?')) return;
    await fetch(`/api/accounts/${id}`, { method: 'DELETE' });
    invalidateCache('/api/accounts');
    refreshAccounts();
  };

  const typeIcons = {
    checking: '🏦', savings: '💰', credit: '💳',
    investment: '📈', cash: '💵', other: '📁',
  };

  const totalBalance = accounts.reduce((sum, a) => sum + (a.balance || 0), 0);

  return (
    <div className="page-container">
      <div className="animate-fade-in" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: '700', marginBottom: '0.25rem' }}>Accounts</h1>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.85rem' }}>
            Manage your financial accounts · Total: <span style={{ color: 'var(--color-accent-emerald-light)', fontWeight: '600', fontFamily: 'var(--font-mono)' }}>{formatCurrency(totalBalance)}</span>
          </p>
        </div>
        <button className="btn-gradient" onClick={openCreate} id="add-account-btn">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 3V13M3 8H13" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
          Add Account
        </button>
      </div>

      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.25rem' }}>
          {[1,2,3].map(i => <div key={i} className="skeleton" style={{ height: '140px', borderRadius: 'var(--radius-lg)' }} />)}
        </div>
      ) : accounts.length > 0 ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.25rem' }}>
          {accounts.map((acc) => (
            <div key={acc._id} className="glass-card animate-fade-in" style={{ padding: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <div style={{
                    width: '40px', height: '40px', borderRadius: '10px',
                    background: 'rgba(99, 102, 241, 0.1)', display: 'flex',
                    alignItems: 'center', justifyContent: 'center', fontSize: '1.25rem',
                  }}>
                    {typeIcons[acc.type] || '📁'}
                  </div>
                  <div>
                    <p style={{ fontWeight: '600', fontSize: '0.95rem' }}>{acc.name}</p>
                    <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', textTransform: 'capitalize' }}>
                      {acc.type}{acc.institution ? ` · ${acc.institution}` : ''}
                    </p>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.25rem' }}>
                  <button onClick={() => openEdit(acc)} style={{
                    background: 'transparent', border: 'none', color: 'var(--color-text-muted)',
                    cursor: 'pointer', padding: '0.25rem', fontSize: '0.85rem',
                  }} title="Edit">✏️</button>
                  <button onClick={() => handleDelete(acc._id)} style={{
                    background: 'transparent', border: 'none', color: 'var(--color-text-muted)',
                    cursor: 'pointer', padding: '0.25rem', fontSize: '0.85rem',
                  }} title="Delete">🗑️</button>
                </div>
              </div>
              <div style={{ borderTop: '1px solid var(--color-border-default)', paddingTop: '0.75rem' }}>
                <p style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>Balance</p>
                <p style={{
                  fontSize: '1.5rem', fontWeight: '700', fontFamily: 'var(--font-mono)',
                  color: acc.balance >= 0 ? 'var(--color-accent-emerald-light)' : 'var(--color-accent-rose-light)',
                }}>
                  {formatCurrency(acc.balance)}
                </p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="glass-card" style={{ padding: '3rem', textAlign: 'center' }}>
          <p style={{ fontSize: '3rem', marginBottom: '1rem' }}>🏦</p>
          <h3 style={{ fontSize: '1.1rem', fontWeight: '600', marginBottom: '0.5rem' }}>No accounts yet</h3>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
            Add your first financial account to start tracking your money.
          </p>
          <button className="btn-gradient" onClick={openCreate}>Add Your First Account</button>
        </div>
      )}

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editingAccount ? 'Edit Account' : 'New Account'}>
        <form onSubmit={handleSave}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '600', color: 'var(--color-text-secondary)', marginBottom: '0.4rem' }}>Account Name</label>
              <input className="input-field" placeholder="e.g. Main Checking" value={form.name} onChange={(e) => setForm({...form, name: e.target.value})} required />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '600', color: 'var(--color-text-secondary)', marginBottom: '0.4rem' }}>Type</label>
              <select className="select-field" value={form.type} onChange={(e) => setForm({...form, type: e.target.value})}>
                {ACCOUNT_TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '600', color: 'var(--color-text-secondary)', marginBottom: '0.4rem' }}>Current Balance</label>
              <input className="input-field" type="number" step="0.01" placeholder="0.00" value={form.balance} onChange={(e) => setForm({...form, balance: e.target.value})} required />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '600', color: 'var(--color-text-secondary)', marginBottom: '0.4rem' }}>Institution (Optional)</label>
              <input className="input-field" placeholder="e.g. Chase, Wells Fargo" value={form.institution} onChange={(e) => setForm({...form, institution: e.target.value})} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem', justifyContent: 'flex-end' }}>
            <button type="button" className="btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
            <button type="submit" className="btn-gradient" disabled={saving}>
              {saving ? 'Saving...' : editingAccount ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

export default function AccountsPage() {
  return (
    <AuthGuard>
      <Sidebar />
      <AccountsContent />
    </AuthGuard>
  );
}
