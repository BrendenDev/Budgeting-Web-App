'use client';

import { useState, useEffect, useMemo } from 'react';
import { useUser } from '@/lib/auth-context';
import { useCachedFetch } from '@/lib/use-cached-fetch';
import { invalidateCache } from '@/lib/data-cache';
import { useDialog } from '@/components/ConfirmDialog';
import AuthGuard from '@/components/AuthGuard';
import Sidebar from '@/components/Sidebar';
import Modal from '@/components/Modal';
import TransactionExplorer from '@/components/TransactionExplorer';
import {
  DEFAULT_BUDGET_SETTINGS,
  EXPENSE_CATEGORIES,
} from '@/models/schemas';
import { toDateStringMT } from '@/lib/date-utils';
import {
  calculateHistoricalBaseline,
  evaluateAllBuckets,
  filterBucketTransactions,
  calculateSavingsProjection,
} from '@/lib/budget-engine';
import {
  BudgetTallyStrip,
  BaselineSection,
  SpendingBucketsSection,
  GoalBucketsSection,
  SavingsProjectionSection,
} from '@/components/budget';
import {
  Page,
  Button,
  TextButton,
  Input,
  Select,
  Field,
  Skeleton,
} from '@/components/ui';

function normalizeConfig(raw) {
  const s = raw?.settings || {};
  return {
    settings: {
      lookbackMonths: Number(s.lookbackMonths) || DEFAULT_BUDGET_SETTINGS.lookbackMonths,
      outlierThresholdPct:
        s.outlierThresholdPct !== undefined
          ? Number(s.outlierThresholdPct)
          : DEFAULT_BUDGET_SETTINGS.outlierThresholdPct,
      includeRecurringInBaseline:
        s.includeRecurringInBaseline !== undefined
          ? Boolean(s.includeRecurringInBaseline)
          : DEFAULT_BUDGET_SETTINGS.includeRecurringInBaseline,
      includeCurrentMonthInBaseline: Boolean(s.includeCurrentMonthInBaseline),
      projectionHorizonMonths:
        Number(s.projectionHorizonMonths) || DEFAULT_BUDGET_SETTINGS.projectionHorizonMonths,
    },
    buckets: Array.isArray(raw?.buckets)
      ? raw.buckets.map((b) => ({
          id: b.id,
          name: b.name || '',
          type: b.type || 'spending_limit',
          monthlyAmount: Number(b.monthlyAmount) || 0,
          categories: Array.isArray(b.categories) ? b.categories : [],
          includeRecurring: b.includeRecurring !== undefined ? Boolean(b.includeRecurring) : true,
          targetAmount:
            b.targetAmount !== null && b.targetAmount !== undefined && b.targetAmount !== ''
              ? Number(b.targetAmount)
              : null,
          startingSaved: Number(b.startingSaved) || 0,
          targetDate: b.targetDate ? toDateStringMT(b.targetDate) : null,
          notes: b.notes || '',
        }))
      : [],
  };
}

function BudgetContent() {
  const { user } = useUser();
  const { confirm, alert: showAlert } = useDialog();

  // Read-only fetches of transactions & accounts (increased limit so 12m history is complete)
  const txUrl = user?.id ? `/api/transactions?userId=${user.id}&limit=2000` : null;
  const accountsUrl = user?.id ? `/api/accounts?userId=${user.id}` : null;
  const budgetUrl = user?.id ? `/api/budget?userId=${user.id}` : null;

  const { data: transactions = [], loading: txLoading } = useCachedFetch(txUrl, { ttl: 30000 });
  const { data: accounts = [], loading: accLoading } = useCachedFetch(accountsUrl, { ttl: 60000 });
  const {
    data: remoteBudget,
    loading: budgetLoading,
    refresh: refreshBudget,
  } = useCachedFetch(budgetUrl, { ttl: 60000 });

  const loading = txLoading || accLoading || budgetLoading;

  // Local working state for settings & buckets (persisted only when Save is clicked)
  const [settings, setSettings] = useState({ ...DEFAULT_BUDGET_SETTINGS });
  const [buckets, setBuckets] = useState([]);
  const [savedSnapshot, setSavedSnapshot] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState(false);

  // Sync local state when remote budget config loads
  useEffect(() => {
    if (remoteBudget && ! Array.isArray(remoteBudget)) {
      const norm = normalizeConfig(remoteBudget);
      setSettings(norm.settings);
      setBuckets(norm.buckets);
      setSavedSnapshot(JSON.stringify(norm));
    }
  }, [remoteBudget]);

  const isDirty = useMemo(() => {
    if (!savedSnapshot) return false;
    const current = JSON.stringify(normalizeConfig({ settings, buckets }));
    return current !== savedSnapshot;
  }, [settings, buckets, savedSnapshot]);

  // Selected spending bucket for inline TransactionExplorer drill-down
  const [selectedBucketId, setSelectedBucketId] = useState(null);

  // Bucket create/edit modal state
  const [showModal, setShowModal] = useState(false);
  const [editingBucketId, setEditingBucketId] = useState(null);
  const [form, setForm] = useState({
    name: '',
    type: 'spending_limit',
    monthlyAmount: '',
    categories: [],
    includeRecurring: true,
    targetAmount: '',
    startingSaved: '',
    targetDate: '',
    notes: '',
  });

  // ─── Persist to /api/budget (explicit Save button or modal save) ───
  const persistBudget = async (nextSettings = settings, nextBuckets = buckets) => {
    setSaving(true);
    try {
      const payload = { settings: nextSettings, buckets: nextBuckets };
      const res = await fetch('/api/budget', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        await showAlert(err.error || 'Could not save budget configuration', {
          title: 'Save Failed',
          variant: 'danger',
        });
      } else {
        const saved = await res.json();
        const norm = normalizeConfig(saved);
        setSettings(norm.settings);
        setBuckets(norm.buckets);
        setSavedSnapshot(JSON.stringify(norm));
        invalidateCache('/api/budget');
        refreshBudget();
        setSaveFeedback(true);
        setTimeout(() => setSaveFeedback(false), 2000);
      }
    } catch (err) {
      await showAlert('Network error while saving budget.', {
        title: 'Save Failed',
        variant: 'danger',
      });
    }
    setSaving(false);
  };

  const handleResetChanges = () => {
    if (!savedSnapshot) return;
    const norm = JSON.parse(savedSnapshot);
    setSettings(norm.settings);
    setBuckets(norm.buckets);
  };

  const handleChangeSetting = (key, value) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const handleToggleBucketRecurring = (bucketId, checked) => {
    setBuckets((prev) =>
      prev.map((b) => (b.id === bucketId ? { ...b, includeRecurring: checked } : b))
    );
  };

  // ─── Bucket Modal Handlers ────────────────────────────────────────
  const openCreateModal = (defaultType = 'spending_limit') => {
    setEditingBucketId(null);
    setForm({
      name: '',
      type: defaultType,
      monthlyAmount: '',
      categories: [],
      includeRecurring: true,
      targetAmount: '',
      startingSaved: '',
      targetDate: '',
      notes: '',
    });
    setShowModal(true);
  };

  const openEditModal = (bucket) => {
    setEditingBucketId(bucket.id);
    setForm({
      name: bucket.name || '',
      type: bucket.type || 'spending_limit',
      monthlyAmount: String(bucket.monthlyAmount ?? ''),
      categories: Array.isArray(bucket.categories) ? [...bucket.categories] : [],
      includeRecurring: bucket.includeRecurring !== undefined ? Boolean(bucket.includeRecurring) : true,
      targetAmount:
        bucket.targetAmount !== null && bucket.targetAmount !== undefined
          ? String(bucket.targetAmount)
          : '',
      startingSaved:
        bucket.startingSaved !== null && bucket.startingSaved !== undefined && bucket.startingSaved > 0
          ? String(bucket.startingSaved)
          : '',
      targetDate: bucket.targetDate ? toDateStringMT(bucket.targetDate) : '',
      notes: bucket.notes || '',
    });
    setShowModal(true);
  };

  const toggleFormCategory = (cat) => {
    setForm((prev) => {
      const exists = prev.categories.includes(cat);
      return {
        ...prev,
        categories: exists
          ? prev.categories.filter((c) => c !== cat)
          : [...prev.categories, cat],
      };
    });
  };

  const handleSaveBucketModal = async (e) => {
    e.preventDefault();
    const entry = {
      id: editingBucketId || `bkt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name: form.name.trim(),
      type: form.type,
      monthlyAmount: Math.max(0, Number(form.monthlyAmount) || 0),
      categories: form.type === 'spending_limit' ? form.categories : [],
      includeRecurring: form.type === 'spending_limit' ? Boolean(form.includeRecurring) : false,
      targetAmount:
        form.type !== 'spending_limit' && form.targetAmount !== ''
          ? Math.max(0, Number(form.targetAmount) || 0)
          : null,
      startingSaved:
        form.type !== 'spending_limit' && form.startingSaved !== ''
          ? Math.max(0, Number(form.startingSaved) || 0)
          : 0,
      targetDate:
        form.type !== 'spending_limit' && form.targetDate ? form.targetDate : null,
      notes: form.notes.trim(),
    };

    const nextBuckets = editingBucketId
      ? buckets.map((b) => (b.id === editingBucketId ? entry : b))
      : [...buckets, entry];

    setBuckets(nextBuckets);
    setShowModal(false);
    await persistBudget(settings, nextBuckets);
  };

  const handleDeleteBucket = async (bucketId) => {
    const target = buckets.find((b) => b.id === bucketId);
    if (!target) return;
    const ok = await confirm(`Remove bucket "${target.name}" from your budget plan?`, {
      title: 'Delete Bucket',
      confirmText: 'Delete',
      variant: 'danger',
      details: ['This only removes the budget bucket — your transactions and accounts are untouched.'],
    });
    if (!ok) return;
    const nextBuckets = buckets.filter((b) => b.id !== bucketId);
    if (selectedBucketId === bucketId) setSelectedBucketId(null);
    setBuckets(nextBuckets);
    await persistBudget(settings, nextBuckets);
  };

  // ─── Modular Calculations (each independent) ──────────────────────
  // Module 1: Historical Baseline & Outlier Trimming
  const baseline = useMemo(
    () =>
      calculateHistoricalBaseline(transactions, {
        lookbackMonths: settings.lookbackMonths,
        outlierThresholdPct: settings.outlierThresholdPct,
        includeRecurring: true,
        includeCurrentMonth: settings.includeCurrentMonthInBaseline,
      }),
    [transactions, settings]
  );

  // Module 2 & 3: Bucket Evaluation (with per-bucket recurring toggle)
  const bucketEval = useMemo(
    () => evaluateAllBuckets(buckets, transactions, settings),
    [buckets, transactions, settings]
  );

  // Module 4: End-of-Horizon Savings Projector
  const projection = useMemo(
    () =>
      calculateSavingsProjection({
        transactions,
        accounts,
        buckets,
        settings,
      }),
    [transactions, accounts, buckets, settings]
  );

  const selectedBucket = useMemo(
    () => bucketEval.spendingBuckets.find((b) => b.id === selectedBucketId) || null,
    [bucketEval.spendingBuckets, selectedBucketId]
  );

  const selectedBucketTx = useMemo(() => {
    if (!selectedBucket) return [];
    return filterBucketTransactions(transactions, selectedBucket);
  }, [transactions, selectedBucket]);

  if (loading) {
    return (
      <Page title="Budget">
        <Skeleton className="mb-10 h-28" />
        <Skeleton className="mb-10 h-64" />
        <Skeleton className="h-64" />
      </Page>
    );
  }

  return (
    <Page
      title="Budget"
      actions={
        <div className="flex flex-wrap items-center gap-3">
          {saveFeedback && <span className="text-xs text-accent">Saved</span>}
          {isDirty && (
            <>
              <span className="text-xs text-warn">Unsaved changes</span>
              <TextButton onClick={handleResetChanges} className="text-xs">
                discard
              </TextButton>
            </>
          )}
          <Button
            variant={isDirty ? 'primary' : 'secondary'}
            onClick={() => persistBudget(settings, buckets)}
            disabled={saving || !isDirty}
          >
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      }
    >
      {/* Top 4-column summary */}
      <BudgetTallyStrip
        baseline={baseline}
        bucketEval={bucketEval}
        projection={projection}
      />

      {/* Module 1: Historical Baseline & Outlier Trimming */}
      <BaselineSection
        baseline={baseline}
        settings={settings}
        onChangeSetting={handleChangeSetting}
      />

      {/* Module 2 & 3: Monthly Spending Buckets */}
      <SpendingBucketsSection
        spendingBuckets={bucketEval.spendingBuckets}
        selectedBucketId={selectedBucketId}
        onSelectBucket={setSelectedBucketId}
        onToggleBucketRecurring={handleToggleBucketRecurring}
        onAddBucket={openCreateModal}
        onEditBucket={openEditModal}
        onDeleteBucket={handleDeleteBucket}
        drilldownSlot={
          selectedBucket && (
            <div className="border-t border-rule py-4">
              <TransactionExplorer
                transactions={selectedBucketTx}
                accounts={accounts}
                initialDateRange="this-month"
                compact={true}
                title={`${selectedBucket.name} (${selectedBucket.includeRecurring ? 'incl. recurring' : 'one-time only'})`}
                onClose={() => setSelectedBucketId(null)}
              />
            </div>
          )
        }
      />

      {/* Module 2: Savings Goals & Specific Item Goals */}
      <GoalBucketsSection
        goalBuckets={bucketEval.goalBuckets}
        onAddBucket={openCreateModal}
        onEditBucket={openEditModal}
        onDeleteBucket={handleDeleteBucket}
      />

      {/* Module 4: End-of-Horizon Savings Simulator */}
      <SavingsProjectionSection
        projection={projection}
        horizonMonths={settings.projectionHorizonMonths}
        onChangeHorizon={(m) => handleChangeSetting('projectionHorizonMonths', m)}
      />

      {/* Create / Edit Bucket Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editingBucketId ? 'Edit bucket' : 'New bucket'}
      >
        <form onSubmit={handleSaveBucketModal}>
          <div className="flex flex-col gap-4">
            <Field label="Bucket type">
              <Select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
              >
                <option value="spending_limit">Monthly spending cap</option>
                <option value="savings_goal">Savings goal</option>
                <option value="item_goal">Save up for a specific item</option>
              </Select>
            </Field>

            <Field
              label={
                form.type === 'spending_limit'
                  ? 'Bucket name'
                  : form.type === 'item_goal'
                    ? 'Item name'
                    : 'Savings goal name'
              }
            >
              <Input
                placeholder={
                  form.type === 'spending_limit'
                    ? 'e.g. Dining & Going Out'
                    : form.type === 'item_goal'
                      ? 'e.g. New Laptop'
                      : 'e.g. Emergency Fund'
                }
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </Field>

            <Field
              label={
                form.type === 'spending_limit'
                  ? 'Max monthly spend ($)'
                  : 'Monthly contribution ($)'
              }
            >
              <Input
                className="num"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={form.monthlyAmount}
                onChange={(e) => setForm({ ...form, monthlyAmount: e.target.value })}
                required
              />
            </Field>

            {form.type === 'spending_limit' ? (
              <>
                <div>
                  <span className="mb-1.5 block text-xs text-muted">
                    Categories (leave all unchecked to cover all expenses)
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {EXPENSE_CATEGORIES.map((cat) => {
                      const active = form.categories.includes(cat);
                      return (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => toggleFormCategory(cat)}
                          className={
                            'cursor-pointer rounded-sm border px-2 py-1 text-xs transition-colors ' +
                            (active
                              ? 'border-accent bg-accent/15 text-accent'
                              : 'border-rule text-muted hover:border-rule-strong hover:text-ink')
                          }
                        >
                          {cat}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <label className="flex cursor-pointer items-center gap-2 text-sm text-ink">
                  <input
                    type="checkbox"
                    checked={form.includeRecurring}
                    onChange={(e) => setForm({ ...form, includeRecurring: e.target.checked })}
                    className="h-4 w-4 cursor-pointer accent-[var(--color-accent)]"
                  />
                  <span>Include recurring costs in this bucket</span>
                </label>
              </>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <Field
                    label={
                      form.type === 'item_goal'
                        ? 'Item price / target ($)'
                        : 'Target goal amount (optional)'
                    }
                  >
                    <Input
                      className="num"
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      value={form.targetAmount}
                      onChange={(e) => setForm({ ...form, targetAmount: e.target.value })}
                      required={form.type === 'item_goal'}
                    />
                  </Field>
                  <Field label="Already saved ($)">
                    <Input
                      className="num"
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      value={form.startingSaved}
                      onChange={(e) => setForm({ ...form, startingSaved: e.target.value })}
                    />
                  </Field>
                </div>

                <Field label="Target date (optional)">
                  <Input
                    type="date"
                    value={form.targetDate}
                    onChange={(e) => setForm({ ...form, targetDate: e.target.value })}
                  />
                </Field>
              </>
            )}

            <Field label="Notes (optional)">
              <Input
                placeholder="Optional note…"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </Field>
          </div>

          <div className="mt-6 flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={() => setShowModal(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving…' : editingBucketId ? 'Update bucket' : 'Create bucket'}
            </Button>
          </div>
        </form>
      </Modal>
    </Page>
  );
}

export default function BudgetPage() {
  return (
    <AuthGuard>
      <Sidebar />
      <BudgetContent />
    </AuthGuard>
  );
}
