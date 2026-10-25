'use client';

import { useState, useEffect, useMemo } from 'react';
import { useUser } from '@/lib/auth-context';
import { useCachedFetch } from '@/lib/use-cached-fetch';
import { invalidateCache } from '@/lib/data-cache';
import AuthGuard from '@/components/AuthGuard';
import Sidebar from '@/components/Sidebar';
import CategoryPicker from '@/components/CategoryPicker';
import TransactionExplorer from '@/components/TransactionExplorer';
import SpendingCalendar from '@/components/SpendingCalendar';
import { projectBalances, calculateMonthlySummary, calculateSpendingPacing, calculateSavingsRate, calculateDailyBurnRate, calculateMonthComparison } from '@/lib/calculation-engine';
import { getTodayMT, getCurrentMonthMT, getCurrentYearMT, toDateStringMT } from '@/lib/date-utils';
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '@/models/schemas';
import ProjectionChart from '@/components/ProjectionChart';
import { TallyStrip, CategoryBreakdown, MonthComparison, RecentEntries, AccountsList, SectionLink } from '@/components/overview';
import { Page, Section, TextButton, Skeleton, Spinner, Empty, lineInputClass } from '@/components/ui';

function DashboardContent() {
  const { user } = useUser();
  const [projectionDays, setProjectionDays] = useState(90);
  const [syncStatus, setSyncStatus] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [selectedDay, setSelectedDay] = useState(null);
  const [calendarMonth, setCalendarMonth] = useState(getCurrentMonthMT());
  const [calendarYear, setCalendarYear] = useState(getCurrentYearMT());
  const [hideRecurring, setHideRecurring] = useState(false);
  const [includeRecurringInBurn, setIncludeRecurringInBurn] = useState(false);

  // Cached data fetches — shared across pages, revalidate on focus
  const accountsUrl = user?.id ? `/api/accounts?userId=${user.id}` : null;
  const txUrl = user?.id ? `/api/transactions?userId=${user.id}&limit=500` : null;
  const rulesUrl = user?.id ? `/api/recurring?userId=${user.id}` : null;
  const { data: accounts, loading: accLoading, refresh: refreshAccounts } = useCachedFetch(accountsUrl, { ttl: 60000 });
  const { data: transactions, loading: txLoading, refresh: refreshTransactions } = useCachedFetch(txUrl, { ttl: 30000 });
  const { data: rules, loading: rulesLoading, refresh: refreshRules } = useCachedFetch(rulesUrl, { ttl: 60000 });
  const loading = accLoading || txLoading || rulesLoading;

  // Quick-add transaction state
  const [quickForm, setQuickForm] = useState({
    description: '', amount: '', type: 'expense', category: 'Misc',
    date: getTodayMT(), accountId: '',
  });
  const [quickSaving, setQuickSaving] = useState(false);
  const [quickSuccess, setQuickSuccess] = useState(false);

  // Auto-select first account for quick-add
  useEffect(() => {
    if (accounts.length > 0 && !quickForm.accountId) {
      setQuickForm(prev => ({ ...prev, accountId: accounts[0]._id }));
    }
  }, [accounts]);

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
        invalidateCache('/api/transactions');
        invalidateCache('/api/accounts');
        refreshTransactions();
        refreshAccounts();
      }
    } catch (err) { console.error(err); }
    setQuickSaving(false);
  };


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
          body: JSON.stringify({ userId: user.id, today: getTodayMT() }),
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
      if (!cancelled) {
        invalidateCache();
        refreshAccounts();
        refreshTransactions();
        refreshRules();
      }
    }

    syncAndFetch();
    return () => { cancelled = true; };
  }, [user?.id]);

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

  // Spending pacing uses the calendar's selected month (not always current month)
  const calendarTransactions = useMemo(() => {
    if (!hideRecurring) return transactions;
    return transactions.filter(tx => !tx.isRecurring);
  }, [transactions, hideRecurring]);

  const spendingPacing = useMemo(() => {
    return calculateSpendingPacing(calendarTransactions, calendarMonth, calendarYear);
  }, [calendarTransactions, calendarMonth, calendarYear]);

  // Convert pacing data to day -> daily amount map for calendar
  const dailySpending = useMemo(() => {
    const map = {};
    spendingPacing.forEach((entry, i) => {
      const prev = i > 0 ? spendingPacing[i - 1].cumulative : 0;
      const daily = entry.cumulative - prev;
      if (daily > 0) map[entry.day] = Number(daily.toFixed(2));
    });
    return map;
  }, [spendingPacing]);

  // Build the date string for selected day drill-down
  const selectedDayDateStr = useMemo(() => {
    if (!selectedDay) return null;
    const m = calendarMonth + 1;
    const y = calendarYear;
    return `${y}-${String(m).padStart(2, '0')}-${String(selectedDay).padStart(2, '0')}`;
  }, [selectedDay, calendarMonth, calendarYear]);

  const savingsRate = useMemo(() => {
    return calculateSavingsRate(monthlySummary.income, monthlySummary.expenses);
  }, [monthlySummary]);

  const burnRate = useMemo(() => {
    const source = includeRecurringInBurn
      ? transactions
      : (Array.isArray(transactions) ? transactions.filter(tx => !tx.isRecurring) : []);
    return calculateDailyBurnRate(source, getCurrentMonthMT(), getCurrentYearMT());
  }, [transactions, includeRecurringInBurn]);

  const monthComparison = useMemo(() => {
    return calculateMonthComparison(transactions, getCurrentMonthMT(), getCurrentYearMT());
  }, [transactions]);

  if (loading) {
    return (
      <Page title="Overview">
        <Skeleton className="mb-10 h-28" />
        <div className="grid gap-10 lg:grid-cols-2">
          <Skeleton className="h-72" />
          <Skeleton className="h-72" />
        </div>
      </Page>
    );
  }

  return (
    <Page
      title="Overview"
      actions={syncStatus && (
        <div className="flex items-center gap-2 text-sm text-muted" role="status">
          {syncStatus === 'syncing' ? (
            <><Spinner className="text-accent" /> Syncing recurring items…</>
          ) : (
            <><span className="text-accent">Synced</span> · created {syncStatus.created} transaction{syncStatus.created !== 1 ? 's' : ''} from recurring items</>
          )}
          {syncStatus !== 'syncing' && (
            <TextButton onClick={() => setSyncStatus(null)} className="text-xs">dismiss</TextButton>
          )}
        </div>
      )}
    >
      {/* ── Tally strip ─────────────────────────────── */}
      <TallyStrip
        totalBalance={totalBalance}
        accountCount={accounts.length}
        monthlySummary={monthlySummary}
        savingsRate={savingsRate}
        burnRate={burnRate}
        includeRecurringInBurn={includeRecurringInBurn}
        onToggleBurnRecurring={setIncludeRecurringInBurn}
      />

      {/* ── Quick Add: the next empty line of the ledger ── */}
      <Section
        className="relative z-10 mb-10"
        title="New entry"
        aside={
          <>
            {quickSuccess && <span className="text-accent">added</span>}
            <span className="flex items-center gap-1.5 text-sm" role="group" aria-label="Entry type">
              {['expense', 'income'].map((t, idx) => (
                <span key={t} className="flex items-center gap-1.5">
                  {idx > 0 && <span className="text-faint">|</span>}
                  <button
                    type="button"
                    aria-pressed={quickForm.type === t}
                    onClick={() => setQuickForm({...quickForm, type: t, category: t === 'income' ? 'Work' : 'Misc'})}
                    className={
                      'cursor-pointer transition-colors ' +
                      (quickForm.type === t
                        ? (t === 'expense' ? 'text-debit underline underline-offset-4' : 'text-accent underline underline-offset-4')
                        : 'text-muted hover:text-ink')
                    }
                  >
                    {t === 'expense' ? 'spent' : 'received'}
                  </button>
                </span>
              ))}
            </span>
          </>
        }
      >
        <form onSubmit={handleQuickAdd} className="grid grid-cols-2 items-end gap-x-4 gap-y-3 md:grid-cols-[8.5rem_1fr_10rem_10rem_7rem_auto]">
          <input className={`${lineInputClass} num`} type="date" value={quickForm.date} onChange={e => setQuickForm({...quickForm, date: e.target.value})} required aria-label="Date" />
          <input className={`${lineInputClass} col-span-2 row-start-1 md:col-span-1 md:row-start-auto`} placeholder={quickForm.type === 'income' ? 'What came in?' : 'What did you spend on?'} value={quickForm.description} onChange={e => setQuickForm({...quickForm, description: e.target.value})} required aria-label="Description" />
          <CategoryPicker
            variant="line"
            categories={quickForm.type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES}
            value={quickForm.category}
            onChange={cat => setQuickForm({...quickForm, category: cat})}
          />
          <select className={`${lineInputClass} cursor-pointer`} value={quickForm.accountId} onChange={e => setQuickForm({...quickForm, accountId: e.target.value})} required aria-label="Account">
            {accounts.length > 1 && <option value="">Account</option>}
            {accounts.map(a => <option key={a._id} value={a._id}>{a.name}</option>)}
          </select>
          <div className="relative">
            <span className="pointer-events-none absolute left-0 top-1/2 -translate-y-1/2 text-sm text-faint">$</span>
            <input className={`${lineInputClass} num pl-3 text-right`} type="number" step="0.01" min="0.01" placeholder="0.00" value={quickForm.amount} onChange={e => setQuickForm({...quickForm, amount: e.target.value})} required aria-label="Amount" />
          </div>
          <TextButton type="submit" tone="accent" disabled={quickSaving} className="justify-self-end py-1.5 font-medium">
            {quickSaving ? 'adding…' : 'add entry'}
          </TextButton>
        </form>
      </Section>

      {/* ── Projection + calendar ───────────────────── */}
      <div className="mb-10 grid gap-10 lg:grid-cols-2">
        <Section
          title="Balance projection"
          aside={
            <span className="flex gap-3">
              {[30, 60, 90, 180, 365].map((d) => (
                <button
                  key={d}
                  onClick={() => setProjectionDays(d)}
                  aria-pressed={projectionDays === d}
                  className={
                    'num cursor-pointer text-xs transition-colors ' +
                    (projectionDays === d ? 'text-ink underline decoration-accent underline-offset-4' : 'text-muted hover:text-ink')
                  }
                >
                  {d}d
                </button>
              ))}
            </span>
          }
        >
          {chartData.length > 1 ? (
            <ProjectionChart data={chartData} />
          ) : (
            <Empty>Add accounts and recurring items to see projections</Empty>
          )}
        </Section>

        <Section
          title="Daily spending"
          aside={
            <label className="flex cursor-pointer items-center gap-2 text-xs text-muted hover:text-ink">
              <input
                type="checkbox"
                checked={hideRecurring}
                onChange={(e) => setHideRecurring(e.target.checked)}
                className="h-3.5 w-3.5 cursor-pointer accent-[var(--color-accent)]"
              />
              Hide recurring
            </label>
          }
        >
          <SpendingCalendar
            dailySpending={dailySpending}
            selectedDay={selectedDay}
            month={calendarMonth}
            year={calendarYear}
            onMonthChange={(m, y) => { setCalendarMonth(m); setCalendarYear(y); setSelectedDay(null); }}
            onDayClick={(day) => setSelectedDay(selectedDay === day ? null : day)}
          />
          {selectedDay && (
            <div className="mt-5 border-t border-rule pt-4">
              <TransactionExplorer
                transactions={calendarTransactions.filter(tx => {
                  if (!selectedDayDateStr) return false;
                  return toDateStringMT(tx.date) === selectedDayDateStr;
                })}
                accounts={accounts}
                initialDateRange="all"
                compact={true}
                title={new Date(calendarYear, calendarMonth, selectedDay).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                onClose={() => setSelectedDay(null)}
              />
            </div>
          )}
        </Section>
      </div>

      {/* ── Category breakdown + month comparison ───── */}
      <div className="mb-10 grid gap-10 lg:grid-cols-2">
        <Section title="Spending by category" bodyClassName="py-0">
          <CategoryBreakdown
            breakdown={monthlySummary.categoryBreakdown}
            totalExpenses={monthlySummary.expenses}
            selectedCategory={selectedCategory}
            onSelect={setSelectedCategory}
          />
          {selectedCategory && (
            <div className="border-t border-rule py-4">
              <TransactionExplorer
                transactions={transactions}
                accounts={accounts}
                initialCategory={selectedCategory}
                initialDateRange="this-month"
                compact={true}
                title={selectedCategory}
                onClose={() => setSelectedCategory(null)}
              />
            </div>
          )}
        </Section>

        <Section title="This month vs last" bodyClassName="py-0">
          <MonthComparison monthComparison={monthComparison} />
        </Section>
      </div>

      {/* ── Recent entries + accounts ───────────────── */}
      <div className="grid gap-10 lg:grid-cols-2">
        <Section title="Recent entries" aside={<SectionLink href="/transactions">view all</SectionLink>} bodyClassName="py-0">
          <RecentEntries items={recentTx} />
        </Section>

        <Section title="Accounts" aside={<SectionLink href="/accounts">manage</SectionLink>} bodyClassName="py-0">
          <AccountsList accounts={accounts} />
        </Section>
      </div>
    </Page>
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
