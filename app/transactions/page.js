'use client';

import { useState } from 'react';
import { useUser } from '@/lib/auth-context';
import { useDialog } from '@/components/ConfirmDialog';
import { useCachedFetch } from '@/lib/use-cached-fetch';
import { invalidateCache } from '@/lib/data-cache';
import CategoryPicker from '@/components/CategoryPicker';
import TransactionExplorer from '@/components/TransactionExplorer';
import AuthGuard from '@/components/AuthGuard';
import Sidebar from '@/components/Sidebar';
import Modal from '@/components/Modal';
import { formatCurrency } from '@/lib/calculation-engine';
import { getTodayMT, toDateStringMT } from '@/lib/date-utils';
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '@/models/schemas';
import { Page, Section, Button, Input, Select, Field } from '@/components/ui';

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
    <Page
      title="Transactions"
      actions={<Button onClick={openCreate} id="add-transaction-btn">Add transaction</Button>}
    >
      <Section title="Ledger">
        <TransactionExplorer
          transactions={transactions}
          accounts={accounts}
          onEdit={openEdit}
          onDelete={handleDelete}
        />
      </Section>

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editingTx ? 'Edit transaction' : 'New transaction'}>
        <form onSubmit={handleSave}>
          <div className="flex flex-col gap-4">
            <Field label="Description">
              <Input placeholder="e.g. Grocery shopping" value={form.description} onChange={(e) => setForm({...form, description: e.target.value})} required />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Amount">
                <Input className="num" type="number" step="0.01" min="0.01" placeholder="0.00" value={form.amount} onChange={(e) => setForm({...form, amount: e.target.value})} required />
              </Field>
              <Field label="Type">
                <Select value={form.type} onChange={(e) => setForm({...form, type: e.target.value, category: e.target.value === 'income' ? 'Work' : 'Misc'})}>
                  <option value="expense">Expense</option>
                  <option value="income">Income</option>
                </Select>
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="mb-1.5 block text-xs text-muted">Category</span>
                <CategoryPicker
                  categories={categories}
                  value={form.category}
                  onChange={cat => setForm({...form, category: cat})}
                />
              </div>
              <Field label="Date">
                <Input type="date" value={form.date} onChange={(e) => setForm({...form, date: e.target.value})} required />
              </Field>
            </div>
            <Field label="Account">
              <Select value={form.accountId} onChange={(e) => setForm({...form, accountId: e.target.value})} required>
                <option value="">Select account</option>
                {accounts.map(a => <option key={a._id} value={a._id}>{a.name}</option>)}
              </Select>
            </Field>
            <Field label="Notes (optional)">
              <Input placeholder="Any additional notes…" value={form.notes} onChange={(e) => setForm({...form, notes: e.target.value})} />
            </Field>
          </div>
          <div className="mt-6 flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving…' : editingTx ? 'Update' : 'Create'}
            </Button>
          </div>
        </form>
      </Modal>
    </Page>
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
