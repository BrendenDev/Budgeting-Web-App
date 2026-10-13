'use client';

/**
 * Presentational pieces of the Overview page.
 * Pure markup: every value is computed in app/page.js and passed in.
 */

import Link from 'next/link';
import { formatCurrency, formatDate } from '@/lib/calculation-engine';
import { Tally, TallyItem, Tag, Empty } from '@/components/ui';

/* ── Tally strip ──────────────────────────────────────────────── */
export function TallyStrip({ totalBalance, accountCount, monthlySummary, monthComparison, savingsRate, burnRate }) {
  const spentDelta = monthComparison?.deltas?.expenses ?? 0;
  const bandColor =
    savingsRate.band === 'red' ? 'bg-debit' : savingsRate.band === 'amber' ? 'bg-warn' : 'bg-accent';
  const ratePct = Math.max(0, Math.min(100, Number(savingsRate.rate) || 0));

  return (
    <Tally className="mb-10">
      <TallyItem
        label="Balance"
        value={formatCurrency(totalBalance)}
        detail={`${accountCount} account${accountCount !== 1 ? 's' : ''}`}
      />
      <TallyItem
        label="Cash flow"
        value={formatCurrency(monthlySummary.net)}
        valueClassName={monthlySummary.net >= 0 ? 'text-accent' : 'text-debit'}
        detail={
          spentDelta !== 0 ? (
            <span>
              spending{' '}
              <span className={spentDelta > 0 ? 'text-debit' : 'text-accent'}>
                {spentDelta > 0 ? '▲' : '▼'} {Math.abs(spentDelta)}%
              </span>{' '}
              vs last month
            </span>
          ) : (
            <span>
              <span className="text-accent">+{formatCurrency(monthlySummary.income)}</span>
              {' / '}
              <span className="text-debit">−{formatCurrency(monthlySummary.expenses)}</span>
            </span>
          )
        }
      />
      <TallyItem
        label="Savings rate"
        value={`${savingsRate.rate}%`}
        detail={
          <span className="mt-2 block h-0.5 w-full bg-rule" aria-hidden>
            <span className={`block h-full ${bandColor}`} style={{ width: `${ratePct}%` }} />
          </span>
        }
      />
      <TallyItem
        label="Per day"
        value={formatCurrency(burnRate.dailyAvg)}
        detail={`~${formatCurrency(burnRate.projected)} by month end`}
      />
    </Tally>
  );
}

/* ── Spending by category ─────────────────────────────────────── */
export function CategoryBreakdown({ breakdown, totalExpenses, selectedCategory, onSelect }) {
  if (!breakdown.length) return <Empty>No expenses this month yet</Empty>;

  return (
    <ul>
      {breakdown.map((c) => {
        const pct = totalExpenses > 0 ? (c.amount / totalExpenses * 100) : 0;
        const isActive = selectedCategory === c.category;
        return (
          <li key={c.category}>
            <button
              type="button"
              onClick={() => onSelect(isActive ? null : c.category)}
              className={
                'group grid w-full cursor-pointer grid-cols-[1fr_auto_3rem] items-center gap-x-3 border-b border-rule px-1 py-2 text-left transition-colors hover:bg-surface-2 ' +
                (isActive ? 'bg-surface-2' : '')
              }
            >
              <span className={`truncate text-sm ${isActive ? 'text-accent' : 'text-ink'}`}>{c.category}</span>
              <span className="num text-sm text-ink">{formatCurrency(c.amount)}</span>
              <span className="num text-right text-xs text-faint">{pct.toFixed(0)}%</span>
              <span className="col-span-3 mt-1.5 block h-0.5 bg-rule">
                <span
                  className={`block h-full ${isActive ? 'bg-accent' : 'bg-muted/60 group-hover:bg-accent/70'}`}
                  style={{ width: `${pct}%` }}
                />
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/* ── This month vs last month ─────────────────────────────────── */
function CompareRow({ label, thisValue, lastValue, delta, goodWhenDown, barClass }) {
  const thisPct = Math.max(2, Math.min(100, lastValue > 0 ? (thisValue / lastValue * 100) : (thisValue > 0 ? 100 : 2)));
  const lastPct = lastValue > 0 ? 100 : 2;
  const good = goodWhenDown ? delta <= 0 : delta >= 0;

  return (
    <div className="py-3">
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-sm text-ink">{label}</span>
        {delta !== 0 && (
          <span className={`num text-xs ${good ? 'text-accent' : 'text-debit'}`}>
            {delta > 0 ? '▲' : '▼'} {Math.abs(delta)}%
          </span>
        )}
      </div>
      <div className="grid grid-cols-[5.5rem_1fr_auto] items-center gap-x-3 gap-y-1.5 text-xs">
        <span className="text-muted">This month</span>
        <span className="h-1.5 bg-rule/60"><span className={`block h-full ${barClass}`} style={{ width: `${thisPct}%` }} /></span>
        <span className="num text-right text-ink">{formatCurrency(thisValue)}</span>

        <span className="text-faint">Last month</span>
        <span className="h-1.5 bg-rule/60"><span className={`block h-full ${barClass} opacity-40`} style={{ width: `${lastPct}%` }} /></span>
        <span className="num text-right text-muted">{formatCurrency(lastValue)}</span>
      </div>
    </div>
  );
}

export function MonthComparison({ monthComparison }) {
  return (
    <div className="divide-y divide-rule">
      <CompareRow
        label="Expenses"
        thisValue={monthComparison.thisMonth.expenses}
        lastValue={monthComparison.lastMonth.expenses}
        delta={monthComparison.deltas.expenses}
        goodWhenDown
        barClass="bg-debit"
      />
      <CompareRow
        label="Income"
        thisValue={monthComparison.thisMonth.income}
        lastValue={monthComparison.lastMonth.income}
        delta={monthComparison.deltas.income}
        barClass="bg-accent"
      />
    </div>
  );
}

/* ── Recent entries ───────────────────────────────────────────── */
export function RecentEntries({ items }) {
  if (!items.length) return <Empty>No transactions yet. Start by adding an account.</Empty>;

  return (
    <ul>
      {items.map((tx, i) => (
        <li key={tx._id || i} className="flex items-center justify-between gap-3 border-b border-rule px-1 py-2.5">
          <div className="min-w-0">
            <p className="truncate text-sm text-ink">{tx.description}</p>
            <p className="truncate text-xs text-faint">{tx.category} · {formatDate(tx.date)}</p>
          </div>
          <span className={`num shrink-0 text-sm ${tx.type === 'income' ? 'text-accent' : 'text-debit'}`}>
            {tx.type === 'income' ? '+' : '-'}{formatCurrency(Math.abs(tx.amount))}
          </span>
        </li>
      ))}
    </ul>
  );
}

/* ── Accounts list ────────────────────────────────────────────── */
export function AccountsList({ accounts }) {
  if (!accounts.length) return <Empty>No accounts yet. Head to Accounts to add one.</Empty>;

  return (
    <ul>
      {accounts.map((acc) => (
        <li key={acc._id} className="flex items-center justify-between gap-3 border-b border-rule px-1 py-2.5">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm text-ink">{acc.name}</span>
            <Tag className="capitalize">{acc.type}</Tag>
            {acc.institution && <span className="hidden truncate text-xs text-faint sm:inline">{acc.institution}</span>}
          </div>
          <span className={`num shrink-0 text-sm ${acc.balance >= 0 ? 'text-ink' : 'text-debit'}`}>
            {formatCurrency(acc.balance)}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function SectionLink({ href, children }) {
  return (
    <Link href={href} className="text-sm text-muted underline-offset-4 transition-colors hover:text-accent hover:underline">
      {children}
    </Link>
  );
}
