'use client';

import { useState } from 'react';
import { useUser } from '@/lib/auth-context';
import { useDialog } from '@/components/ConfirmDialog';
import AuthGuard from '@/components/AuthGuard';
import Sidebar from '@/components/Sidebar';
import Modal from '@/components/Modal';
import { formatCurrency } from '@/lib/calculation-engine';
import { ACCOUNT_TYPES } from '@/models/schemas';
import { useCachedFetch } from '@/lib/use-cached-fetch';
import { invalidateCache } from '@/lib/data-cache';
import { Page, Section, Button, TextButton, Input, Select, Field, Table, Th, Td, rowClass, Tag, Skeleton } from '@/components/ui';

function AccountsContent() {
  const { user } = useUser();
  const { alert: showAlert, confirm } = useDialog();
  const [showModal, setShowModal] = useState(false);
  const [editingAccount, setEditingAccount] = useState(null);
  const [form, setForm] = useState({ name: '', type: 'checking', balance: '', institution: '' });
  const [saving, setSaving] = useState(false);
  const [recalculating, setRecalculating] = useState(null); // accountId or 'all'

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
          // originalBalance = what the form was opened with. The server applies
          // only the difference, so saving without touching the balance never moves money.
          body: JSON.stringify({ ...form, originalBalance: editingAccount.balance }),
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

  const handleDelete = async (acc) => {
    // Fetch fresh counts so the user sees exactly what will be removed
    let transactionCount = 0;
    let ruleCount = 0;
    try {
      const res = await fetch(`/api/accounts/${acc._id}?withCounts=1`);
      if (!res.ok) {
        await showAlert('Could not load account details. Nothing was deleted.', { title: 'Delete Failed', variant: 'danger' });
        return;
      }
      const info = await res.json();
      transactionCount = info.transactionCount || 0;
      ruleCount = info.ruleCount || 0;
    } catch {
      await showAlert('Network error. Nothing was deleted.', { title: 'Delete Failed', variant: 'danger' });
      return;
    }

    const ok = await confirm(`Delete "${acc.name}" and everything attached to it?`, {
      title: 'Delete Account',
      confirmText: 'Delete Everything',
      variant: 'danger',
      details: [
        `${transactionCount} transaction${transactionCount !== 1 ? 's' : ''} will be permanently deleted`,
        `${ruleCount} recurring item${ruleCount !== 1 ? 's' : ''} will be permanently deleted`,
        'This action cannot be undone',
      ],
    });
    if (!ok) return;

    try {
      const res = await fetch(`/api/accounts/${acc._id}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        await showAlert(err.error || 'Delete failed. You can safely try again.', { title: 'Delete Failed', variant: 'danger' });
      }
    } catch {
      await showAlert('Network error. You can safely try again.', { title: 'Delete Failed', variant: 'danger' });
    }
    invalidateCache('/api/accounts');
    invalidateCache('/api/transactions');
    invalidateCache('/api/recurring');
    refreshAccounts();
  };

  const handleRecalculate = async (accId, accName) => {
    setRecalculating(accId);
    try {
      const res = await fetch(`/api/accounts/${accId}/recalculate`, { method: 'POST' });
      const result = await res.json();
      if (!res.ok) {
        await showAlert(result.error || 'Recalculation failed');
      } else if (result.driftDetected) {
        await showAlert(`${accName} corrected: ${formatCurrency(result.previousBalance)} → ${formatCurrency(result.correctBalance)} (${result.delta >= 0 ? '+' : ''}${formatCurrency(result.delta)} drift)`);
      } else {
        await showAlert(`${accName}: Balance verified ✓ (${formatCurrency(result.correctBalance)})`);
      }
      invalidateCache('/api/accounts');
      refreshAccounts();
    } catch (e) {
      await showAlert('Recalculation failed');
    }
    setRecalculating(null);
  };

  const handleRecalculateAll = async () => {
    setRecalculating('all');
    const results = [];
    for (const acc of accounts) {
      try {
        const res = await fetch(`/api/accounts/${acc._id}/recalculate`, { method: 'POST' });
        const result = await res.json();
        if (res.ok) {
          results.push(`${acc.name}: ${result.driftDetected ? `${formatCurrency(result.previousBalance)} → ${formatCurrency(result.correctBalance)}` : '✓ OK'}`);
        } else {
          results.push(`${acc.name}: Error — ${result.error}`);
        }
      } catch {
        results.push(`${acc.name}: Error`);
      }
    }
    invalidateCache('/api/accounts');
    refreshAccounts();
    await showAlert(results.join('\n'));
    setRecalculating(null);
  };

  const totalBalance = accounts.reduce((sum, a) => sum + (a.balance || 0), 0);

  return (
    <Page
      title="Accounts"
      actions={
        <>
          <Button
            variant="secondary"
            onClick={handleRecalculateAll}
            disabled={recalculating === 'all' || accounts.length === 0}
            title="Recalculate all account balances from transaction history"
          >
            {recalculating === 'all' ? 'Rechecking…' : 'Recheck all'}
          </Button>
          <Button onClick={openCreate} id="add-account-btn">Add account</Button>
        </>
      }
    >
      <Section
        title="All accounts"
        aside={<span>Total <span className="num ml-1 text-ink">{formatCurrency(totalBalance)}</span></span>}
        bodyClassName="py-0"
      >
        {loading ? (
          <div className="space-y-2 py-4">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-9" />)}
          </div>
        ) : accounts.length > 0 ? (
          <Table>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Type</Th>
                <Th className="hidden sm:table-cell">Institution</Th>
                <Th align="right">Balance</Th>
                <Th align="right"><span className="sr-only">Actions</span></Th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((acc) => (
                <tr key={acc._id} className={rowClass}>
                  <Td className="text-ink">{acc.name}</Td>
                  <Td><Tag className="capitalize">{acc.type}</Tag></Td>
                  <Td className="hidden text-muted sm:table-cell">{acc.institution || '—'}</Td>
                  <Td align="right">
                    <span className={`num ${acc.balance >= 0 ? 'text-ink' : 'text-debit'}`}>{formatCurrency(acc.balance)}</span>
                  </Td>
                  <Td align="right" className="whitespace-nowrap">
                    <span className="inline-flex gap-3">
                      <TextButton
                        tone="warn"
                        className="text-xs"
                        onClick={() => handleRecalculate(acc._id, acc.name)}
                        disabled={recalculating === acc._id}
                        title="Recalculate balance from transactions"
                      >
                        {recalculating === acc._id ? 'checking…' : 'recheck'}
                      </TextButton>
                      <TextButton className="text-xs" onClick={() => openEdit(acc)}>edit</TextButton>
                      <TextButton tone="debit" className="text-xs" onClick={() => handleDelete(acc)}>delete</TextButton>
                    </span>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <div className="py-10 text-center">
            <p className="mb-1 text-ink">No accounts yet</p>
            <p className="mb-5 text-sm text-muted">Add your first account to start tracking your money.</p>
            <Button onClick={openCreate}>Add your first account</Button>
          </div>
        )}
      </Section>

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editingAccount ? 'Edit account' : 'New account'}>
        <form onSubmit={handleSave}>
          <div className="flex flex-col gap-4">
            <Field label="Account name">
              <Input placeholder="e.g. Main Checking" value={form.name} onChange={(e) => setForm({...form, name: e.target.value})} required />
            </Field>
            <Field label="Type">
              <Select value={form.type} onChange={(e) => setForm({...form, type: e.target.value})}>
                {ACCOUNT_TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
              </Select>
            </Field>
            <Field label="Current balance">
              <Input className="num" type="number" step="0.01" placeholder="0.00" value={form.balance} onChange={(e) => setForm({...form, balance: e.target.value})} required />
            </Field>
            <Field label="Institution (optional)">
              <Input placeholder="e.g. Chase, Wells Fargo" value={form.institution} onChange={(e) => setForm({...form, institution: e.target.value})} />
            </Field>
          </div>
          <div className="mt-6 flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving…' : editingAccount ? 'Update' : 'Create'}
            </Button>
          </div>
        </form>
      </Modal>
    </Page>
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
