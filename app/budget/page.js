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
import { formatCurrency, formatDate } from '@/lib/calculation-engine';
import { getTodayMT, toDateStringMT } from '@/lib/date-utils';
import {
  calculateHistoricalBaseline,
  evaluateAllBuckets,
  evaluateGoalBucket,
  filterBucketTransactions,
  calculateSavingsProjection,
} from '@/lib/budget-engine';
import {
  BudgetTallyStrip,
  SavingsTargetSection,
  SpendingBucketsSection,
  GoalBucketsSection,
  SavingsProjectionSection,
  BaselineSection,
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
      savingsTargetMode: ['percent', 'amount'].includes(s.savingsTargetMode)
        ? s.savingsTargetMode
        : DEFAULT_BUDGET_SETTINGS.savingsTargetMode,
      savingsTargetValue:
        s.savingsTargetValue !== undefined && !isNaN(Number(s.savingsTargetValue))
          ? Number(s.savingsTargetValue)
          : DEFAULT_BUDGET_SETTINGS.savingsTargetValue,
      projectionHorizonMonths:
        Number(s.projectionHorizonMonths) || DEFAULT_BUDGET_SETTINGS.projectionHorizonMonths,
      projectionTargetDate: s.projectionTargetDate ? toDateStringMT(s.projectionTargetDate) : null,
    },
    buckets: Array.isArray(raw?.buckets)
      ? raw.buckets.map((b) => ({
          id: b.id,
          name: b.name || '',
          type: b.type === 'item_goal' ? 'item_goal' : 'spending_limit',
          incomePercentage: Number(b.incomePercentage) || 0,
          monthlyAmount: Number(b.monthlyAmount) || 0,
          categories: Array.isArray(b.categories) ? b.categories : [],
          ruleIds: Array.isArray(b.ruleIds) ? b.ruleIds.map(String) : [],
          transactionIds: Array.isArray(b.transactionIds) ? b.transactionIds.map(String) : [],
          includeRecurring: b.includeRecurring !== undefined ? Boolean(b.includeRecurring) : true,
          targetAmount:
            b.targetAmount !== null && b.targetAmount !== undefined && b.targetAmount !== ''
              ? Number(b.targetAmount)
              : null,
          startingSaved: Number(b.startingSaved) || 0,
          targetDate: b.targetDate ? toDateStringMT(b.targetDate) : null,
        }))
      : [],
  };
}

function BudgetContent() {
  const { user } = useUser();
  const { confirm, alert: showAlert } = useDialog();

  // Read-only fetches of transactions, accounts, and recurring rules
  const txUrl = user?.id ? `/api/transactions?userId=${user.id}&limit=2000` : null;
  const accountsUrl = user?.id ? `/api/accounts?userId=${user.id}` : null;
  const rulesUrl = user?.id ? `/api/recurring?userId=${user.id}` : null;
  const budgetUrl = user?.id ? `/api/budget?userId=${user.id}` : null;

  const { data: transactions = [], loading: txLoading } = useCachedFetch(txUrl, { ttl: 30000 });
  const { data: accounts = [], loading: accLoading } = useCachedFetch(accountsUrl, { ttl: 60000 });
  const { data: rules = [], loading: rulesLoading } = useCachedFetch(rulesUrl, { ttl: 60000 });
  const {
    data: remoteBudget,
    loading: budgetLoading,
    refresh: refreshBudget,
  } = useCachedFetch(budgetUrl, { ttl: 60000 });

  const loading = txLoading || accLoading || rulesLoading || budgetLoading;

  // Map of ruleId -> rule for fast lookup
  const rulesMap = useMemo(() => {
    const map = new Map();
    for (const r of Array.isArray(rules) ? rules : []) {
      if (r?._id) map.set(String(r._id), r);
    }
    return map;
  }, [rules]);

  const expenseRules = useMemo(
    () => (Array.isArray(rules) ? rules.filter((r) => r?.type === 'expense') : []),
    [rules]
  );

  // Local working state for settings & buckets (persisted only when Save is clicked)
  const [settings, setSettings] = useState({ ...DEFAULT_BUDGET_SETTINGS });
  const [buckets, setBuckets] = useState([]);
  const [savedSnapshot, setSavedSnapshot] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState(false);

  // Sync local state when remote budget config loads
  useEffect(() => {
    if (remoteBudget && !Array.isArray(remoteBudget)) {
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
  const [txSearch, setTxSearch] = useState('');
  const [form, setForm] = useState({
    name: '',
    type: 'spending_limit',
    incomePercentage: '25',
    monthlyAmount: '',
    categories: [],
    ruleIds: [],
    transactionIds: [],
    includeRecurring: true,
    targetAmount: '',
    startingSaved: '',
    targetDate: '',
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

  const handleChangeHorizonMonths = (months) => {
    const todayStr = getTodayMT();
    const [ty, tm] = todayStr.split('-').map(Number);
    const targetObj = new Date(Date.UTC(ty, (tm - 1) + months, 1, 12, 0, 0));
    const nextDateStr = `${targetObj.getUTCFullYear()}-${String(targetObj.getUTCMonth() + 1).padStart(2, '0')}-01`;
    setSettings((prev) => ({
      ...prev,
      projectionHorizonMonths: months,
      projectionTargetDate: nextDateStr,
    }));
  };

  const handleChangeTargetDate = (dateStr) => {
    if (!dateStr) {
      setSettings((prev) => ({ ...prev, projectionTargetDate: null }));
      return;
    }
    const todayStr = getTodayMT();
    const [ty, tm] = todayStr.split('-').map(Number);
    const [gy, gm] = dateStr.split('-').map(Number);
    setSettings((prev) => {
      const months =
        gy && gm
          ? Math.max(1, Math.min(240, (gy - ty) * 12 + (gm - tm)))
          : prev.projectionHorizonMonths;
      return {
        ...prev,
        projectionTargetDate: dateStr,
        projectionHorizonMonths: months,
      };
    });
  };

  const handleChangeBucketPct = (bucketId, nextPct) => {
    setBuckets((prev) =>
      prev.map((b) => (b.id === bucketId ? { ...b, incomePercentage: nextPct } : b))
    );
  };

  // ─── Modular Calculations (each independent) ──────────────────────
  // Module 1: Historical Baseline & Outlier Trimming (Income & Spend separately)
  const baseline = useMemo(
    () =>
      calculateHistoricalBaseline(transactions, {
        lookbackMonths: settings.lookbackMonths,
        outlierThresholdPct: settings.outlierThresholdPct,
      }),
    [transactions, settings.lookbackMonths, settings.outlierThresholdPct]
  );

  // Module 2: Top-Down Bucket Evaluation
  const bucketEval = useMemo(
    () => evaluateAllBuckets(buckets, transactions, settings, {}, baseline),
    [buckets, transactions, settings, baseline]
  );

  // Module 3: Future Balance & Payoff Estimator
  const projection = useMemo(
    () =>
      calculateSavingsProjection({
        transactions,
        accounts,
        buckets,
        settings,
        precomputedBaseline: baseline,
        precomputedBucketEval: bucketEval,
      }),
    [transactions, accounts, buckets, settings, baseline, bucketEval]
  );

  const selectedBucket = useMemo(
    () => bucketEval.spendingBuckets.find((b) => b.id === selectedBucketId) || null,
    [bucketEval.spendingBuckets, selectedBucketId]
  );

  const selectedBucketTx = useMemo(() => {
    if (!selectedBucket) return [];
    return filterBucketTransactions(transactions, selectedBucket);
  }, [transactions, selectedBucket]);

  // ─── Bucket Modal Handlers ────────────────────────────────────────
  const openCreateModal = (defaultType = 'spending_limit') => {
    setEditingBucketId(null);
    setTxSearch('');
    const defaultPct = Math.max(5, Math.min(100, Math.round(bucketEval.unallocatedPct > 0 ? Math.min(25, bucketEval.unallocatedPct) : 20)));
    setForm({
      name: '',
      type: defaultType,
      incomePercentage: String(defaultPct),
      monthlyAmount: '',
      categories: [],
      ruleIds: [],
      transactionIds: [],
      includeRecurring: true,
      targetAmount: '',
      startingSaved: '',
      targetDate: '',
    });
    setShowModal(true);
  };

  const openEditModal = (bucket) => {
    setEditingBucketId(bucket.id);
    setTxSearch('');
    setForm({
      name: bucket.name || '',
      type: bucket.type === 'item_goal' ? 'item_goal' : 'spending_limit',
      incomePercentage: String(bucket.incomePercentage ?? 20),
      monthlyAmount:
        bucket.type === 'item_goal' && bucket.monthlyAmount > 0
          ? String(bucket.monthlyAmount)
          : '',
      categories: Array.isArray(bucket.categories) ? [...bucket.categories] : [],
      ruleIds: Array.isArray(bucket.ruleIds) ? [...bucket.ruleIds] : [],
      transactionIds: Array.isArray(bucket.transactionIds) ? [...bucket.transactionIds] : [],
      includeRecurring: bucket.includeRecurring !== undefined ? Boolean(bucket.includeRecurring) : true,
      targetAmount:
        bucket.targetAmount !== null && bucket.targetAmount !== undefined && bucket.targetAmount > 0
          ? String(bucket.targetAmount)
          : '',
      startingSaved:
        bucket.startingSaved !== null && bucket.startingSaved !== undefined && bucket.startingSaved > 0
          ? String(bucket.startingSaved)
          : '',
      targetDate: bucket.targetDate ? toDateStringMT(bucket.targetDate) : '',
    });
    setShowModal(true);
  };

  const toggleFormArrayItem = (field, item) => {
    setForm((prev) => {
      const list = Array.isArray(prev[field]) ? prev[field] : [];
      const exists = list.includes(item);
      return {
        ...prev,
        [field]: exists ? list.filter((x) => x !== item) : [...list, item],
      };
    });
  };

  const handleSaveBucketModal = async (e) => {
    e.preventDefault();
    const isSpending = form.type === 'spending_limit';
    const pct = isSpending ? Math.max(0, Number(form.incomePercentage) || 0) : 0;
    const computedMaxSpend = isSpending ? (bucketEval.spendablePool * pct) / 100 : 0;

    const entry = {
      id: editingBucketId || `bkt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name: form.name.trim(),
      type: form.type,
      incomePercentage: pct,
      monthlyAmount: isSpending
        ? Number(computedMaxSpend.toFixed(2))
        : Math.max(0, Number(form.monthlyAmount) || 0),
      categories: isSpending ? form.categories : [],
      ruleIds: isSpending ? form.ruleIds : [],
      transactionIds: isSpending ? form.transactionIds : [],
      includeRecurring: isSpending ? Boolean(form.includeRecurring) : true,
      targetAmount:
        !isSpending && form.targetAmount !== ''
          ? Math.max(0, Number(form.targetAmount) || 0)
          : null,
      startingSaved:
        !isSpending && form.startingSaved !== ''
          ? Math.max(0, Number(form.startingSaved) || 0)
          : 0,
      targetDate: !isSpending && form.targetDate ? form.targetDate : null,
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
    const ok = await confirm(`Remove "${target.name}" from your budget plan?`, {
      title: 'Delete Bucket',
      confirmText: 'Delete',
      variant: 'danger',
      details: ['This only removes the budget item — your transactions and accounts are untouched.'],
    });
    if (!ok) return;
    const nextBuckets = buckets.filter((b) => b.id !== bucketId);
    if (selectedBucketId === bucketId) setSelectedBucketId(null);
    setBuckets(nextBuckets);
    await persistBudget(settings, nextBuckets);
  };

  // Filtered recent expense transactions for cherry-picking in the modal (computed only when modal is open)
  const recentExpenseTransactions = useMemo(() => {
    if (!showModal || form.type !== 'spending_limit') return [];
    const list = (Array.isArray(transactions) ? transactions : []).filter(
      (tx) => tx?.type === 'expense'
    );
    const q = txSearch.trim().toLowerCase();
    const filtered = q
      ? list.filter(
          (tx) =>
            (tx.description || '').toLowerCase().includes(q) ||
            (tx.category || '').toLowerCase().includes(q)
        )
      : list;
    return filtered.slice(0, 30);
  }, [showModal, form.type, transactions, txSearch]);

  // Live preview inside the modal for an Item Bucket
  const itemModalPreview = useMemo(() => {
    if (form.type === 'spending_limit') return null;
    return evaluateGoalBucket({
      type: 'item_goal',
      targetAmount: form.targetAmount,
      startingSaved: form.startingSaved,
      targetDate: form.targetDate || null,
      monthlyAmount: form.monthlyAmount,
    });
  }, [form]);

  if (loading) {
    return (
      <Page title="Budget">
        <Skeleton className="mb-10 h-28" />
        <Skeleton className="mb-10 h-40" />
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

      {/* Step 1: Monthly Savings / Drawdown Target */}
      <SavingsTargetSection
        bucketEval={bucketEval}
        settings={settings}
        onChangeSetting={handleChangeSetting}
      />

      {/* Step 2: Percentage-Based Spending Buckets */}
      <SpendingBucketsSection
        bucketEval={bucketEval}
        rulesMap={rulesMap}
        selectedBucketId={selectedBucketId}
        onSelectBucket={setSelectedBucketId}
        onChangeBucketPct={handleChangeBucketPct}
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
                title={`${selectedBucket.name} (${selectedBucket.incomePercentage}% · max ${formatCurrency(selectedBucket.maxSpend)}/mo)`}
                onClose={() => setSelectedBucketId(null)}
              />
            </div>
          )
        }
      />

      {/* Step 3: Extra Buckets — Things I Want to Buy */}
      <GoalBucketsSection
        goalBuckets={bucketEval.goalBuckets}
        onAddBucket={openCreateModal}
        onEditBucket={openEditModal}
        onDeleteBucket={handleDeleteBucket}
      />

      {/* Step 4: Future Balance & Payoff Date Estimator */}
      <SavingsProjectionSection
        projection={projection}
        horizonMonths={projection.horizonMonths}
        targetDateStr={settings.projectionTargetDate}
        onChangeHorizon={handleChangeHorizonMonths}
        onChangeTargetDate={handleChangeTargetDate}
      />

      {/* Step 5: Past Months Average & Deviation Filter */}
      <BaselineSection
        baseline={baseline}
        settings={settings}
        onChangeSetting={handleChangeSetting}
      />

      {/* Create / Edit Bucket Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={
          editingBucketId
            ? form.type === 'spending_limit'
              ? 'Edit spending bucket'
              : 'Edit item to buy'
            : form.type === 'spending_limit'
              ? 'New spending bucket'
              : 'Add item to buy'
        }
      >
        <form onSubmit={handleSaveBucketModal}>
          <div className="flex flex-col gap-4">
            <Field label="Bucket type">
              <Select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
              >
                <option value="spending_limit">Spending bucket (% of spendable income)</option>
                <option value="item_goal">Item to buy (deducted before % buckets)</option>
              </Select>
            </Field>

            <Field
              label={form.type === 'spending_limit' ? 'Bucket name' : 'Item you want to buy'}
            >
              <Input
                placeholder={
                  form.type === 'spending_limit'
                    ? 'e.g. Housing & Utilities, Food & Going Out'
                    : 'e.g. New Skis, Laptop, Trip'
                }
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </Field>

            {form.type === 'spending_limit' ? (
              <>
                <Field
                  label="Percentage of spendable income (%)"
                  hint={`Max spend: ${formatCurrency((bucketEval.spendablePool * (Number(form.incomePercentage) || 0)) / 100)}/mo out of ${formatCurrency(bucketEval.spendablePool)}/mo spendable pool`}
                >
                  <Input
                    className="num"
                    type="number"
                    step="0.5"
                    min="0"
                    max="100"
                    placeholder="25"
                    value={form.incomePercentage}
                    onChange={(e) => setForm({ ...form, incomePercentage: e.target.value })}
                    required
                  />
                </Field>

                {/* 1. Attribute by Category */}
                <div>
                  <span className="mb-1.5 block text-xs text-muted">
                    Select categories (or pick specific recurring bills / transactions below)
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {EXPENSE_CATEGORIES.map((cat) => {
                      const active = form.categories.includes(cat);
                      return (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => toggleFormArrayItem('categories', cat)}
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

                {/* 2. Attribute Specific Recurring Rules / Bills */}
                {expenseRules.length > 0 && (
                  <div>
                    <span className="mb-1.5 block text-xs text-muted">
                      Attribute specific recurring bills ({form.ruleIds.length} selected)
                    </span>
                    <div className="max-h-32 overflow-y-auto rounded-sm border border-rule bg-surface-2 p-2">
                      {expenseRules.map((r) => {
                        const rid = String(r._id);
                        const checked = form.ruleIds.includes(rid);
                        return (
                          <label
                            key={rid}
                            className="flex cursor-pointer items-center justify-between py-1 text-xs hover:text-ink"
                          >
                            <span className="flex items-center gap-2 text-ink">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleFormArrayItem('ruleIds', rid)}
                                className="h-3.5 w-3.5 accent-[var(--color-accent)]"
                              />
                              <span>{r.name}</span>
                              <span className="text-faint">({r.category})</span>
                            </span>
                            <span className="num text-muted">
                              {formatCurrency(r.amount)} / {r.frequency}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 3. Attribute Specific Individual Transactions */}
                <div>
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <span className="text-xs text-muted">
                      Attribute specific transactions ({form.transactionIds.length} selected)
                    </span>
                    <input
                      type="text"
                      placeholder="Filter transactions…"
                      value={txSearch}
                      onChange={(e) => setTxSearch(e.target.value)}
                      className="rounded-sm border border-rule bg-surface-2 px-2 py-0.5 text-xs text-ink placeholder:text-faint focus:border-accent focus:outline-none"
                    />
                  </div>
                  <div className="max-h-32 overflow-y-auto rounded-sm border border-rule bg-surface-2 p-2">
                    {recentExpenseTransactions.length === 0 ? (
                      <div className="py-2 text-center text-xs text-faint">
                        No matching expense transactions
                      </div>
                    ) : (
                      recentExpenseTransactions.map((tx) => {
                        const tid = String(tx._id);
                        const checked = form.transactionIds.includes(tid);
                        return (
                          <label
                            key={tid}
                            className="flex cursor-pointer items-center justify-between py-1 text-xs hover:text-ink"
                          >
                            <span className="flex items-center gap-2 truncate pr-2 text-ink">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleFormArrayItem('transactionIds', tid)}
                                className="h-3.5 w-3.5 accent-[var(--color-accent)]"
                              />
                              <span className="truncate">{tx.description}</span>
                              <span className="text-faint">· {formatDate(tx.date)}</span>
                            </span>
                            <span className="num shrink-0 text-muted">
                              {formatCurrency(tx.amount)}
                            </span>
                          </label>
                        );
                      })
                    )}
                  </div>
                </div>

                <label className="flex cursor-pointer items-center gap-2 text-xs text-muted hover:text-ink">
                  <input
                    type="checkbox"
                    checked={form.includeRecurring}
                    onChange={(e) => setForm({ ...form, includeRecurring: e.target.checked })}
                    className="h-3.5 w-3.5 cursor-pointer accent-[var(--color-accent)]"
                  />
                  <span>Include recurring expenses in selected categories</span>
                </label>
              </>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Total item price ($)">
                    <Input
                      className="num"
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="1200.00"
                      value={form.targetAmount}
                      onChange={(e) => setForm({ ...form, targetAmount: e.target.value })}
                      required
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

                <div className="grid grid-cols-2 gap-4">
                  <Field
                    label="Target payoff date"
                    hint="Calculates monthly deduction"
                  >
                    <Input
                      type="date"
                      value={form.targetDate}
                      onChange={(e) => setForm({ ...form, targetDate: e.target.value })}
                    />
                  </Field>
                  <Field
                    label="Or monthly amount ($)"
                    hint="Leave blank to auto-calculate from date"
                  >
                    <Input
                      className="num"
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder={
                        itemModalPreview?.requiredMonthlyForTargetDate
                          ? String(itemModalPreview.requiredMonthlyForTargetDate)
                          : '0.00'
                      }
                      value={form.monthlyAmount}
                      onChange={(e) => setForm({ ...form, monthlyAmount: e.target.value })}
                    />
                  </Field>
                </div>

                {itemModalPreview && itemModalPreview.effectiveMonthlyCost > 0 && (
                  <div className="rounded-sm border border-rule bg-surface-2 px-3 py-2 text-xs text-muted">
                    Deducts{' '}
                    <span className="num font-medium text-warn">
                      −{formatCurrency(itemModalPreview.effectiveMonthlyCost)}/mo
                    </span>{' '}
                    from your spendable pool
                    {itemModalPreview.estimatedPayoffLabel && (
                      <>
                        {' · paid off by '}
                        <span className="num text-ink">{itemModalPreview.estimatedPayoffLabel}</span>
                        {itemModalPreview.monthsToGoal !== null && (
                          <span> ({itemModalPreview.monthsToGoal} mo)</span>
                        )}
                      </>
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          <div className="mt-6 flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={() => setShowModal(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving…' : editingBucketId ? 'Update' : 'Add to budget'}
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
