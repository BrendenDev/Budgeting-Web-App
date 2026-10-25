'use client';

/**
 * Presentational modules for the Budget & Analytics page.
 * Each section renders output from its corresponding lib/budget-engine/* module.
 */

import { formatCurrency, formatDate } from '@/lib/calculation-engine';
import {
  Tally,
  TallyItem,
  Section,
  Table,
  Th,
  Td,
  rowClass,
  Tag,
  TextButton,
  Button,
  Empty,
  inputClass,
} from '@/components/ui';

/* ── Top Tally Strip ──────────────────────────────────────────── */
export function BudgetTallyStrip({ baseline, bucketEval, projection }) {
  const netMonthly = projection.monthlySavingsBudgeted;
  const horizonNet = projection.projectedNetSavingsBudgeted;

  return (
    <Tally className="mb-10">
      <TallyItem
        label="Trimmed avg spend"
        value={formatCurrency(baseline.trimmedAvgExpenses)}
        detail={
          <span>
            {baseline.keptMonthCount} of {baseline.activeMonthCount} mo · ±{baseline.outlierThresholdPct}% cap
          </span>
        }
      />
      <TallyItem
        label="Budgeted spend"
        value={formatCurrency(projection.totalEffectiveMonthlySpend)}
        detail={
          <span>
            <span className="num text-ink">{formatCurrency(bucketEval.totalSpendingCaps)}</span> caps
            {projection.unbucketedRecurring > 0 && (
              <> + <span className="num text-muted">{formatCurrency(projection.unbucketedRecurring)}</span> rec</>
            )}
            {projection.unbucketedCategorySpend > 0 && (
              <> + <span className="num text-muted">{formatCurrency(projection.unbucketedCategorySpend)}</span> other</>
            )}
          </span>
        }
      />
      <TallyItem
        label="Goal allocations"
        value={formatCurrency(bucketEval.totalGoalAllocations)}
        detail={`${bucketEval.goalBuckets.length} goal${bucketEval.goalBuckets.length !== 1 ? 's' : ''} / mo`}
      />
      <TallyItem
        label={`Est. savings (${projection.horizonMonths}m)`}
        value={`${horizonNet >= 0 ? '+' : '−'}${formatCurrency(Math.abs(horizonNet))}`}
        valueClassName={horizonNet >= 0 ? 'text-accent' : 'text-debit'}
        detail={
          <span>
            <span className={`num ${netMonthly >= 0 ? 'text-accent' : 'text-debit'}`}>
              {netMonthly >= 0 ? '+' : '−'}{formatCurrency(Math.abs(netMonthly))}/mo
            </span>
            {' · by '}{projection.horizonEndLabel}
          </span>
        }
      />
    </Tally>
  );
}

/* ── Module 1 UI: Historical Baseline & Outlier Trimming ──────── */
export function BaselineSection({
  baseline,
  settings,
  onChangeSetting,
}) {
  return (
    <Section
      className="mb-10"
      title="Historical baseline & outlier filter"
      aside={
        <div className="flex flex-wrap items-center gap-4 text-xs">
          {/* Lookback selector */}
          <span className="flex items-center gap-1.5" role="group" aria-label="Lookback months">
            <span className="text-faint">Window:</span>
            {[3, 6, 9, 12].map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => onChangeSetting('lookbackMonths', m)}
                className={
                  'num cursor-pointer px-1 transition-colors ' +
                  (settings.lookbackMonths === m
                    ? 'text-ink underline decoration-accent underline-offset-4'
                    : 'text-muted hover:text-ink')
                }
              >
                {m}m
              </button>
            ))}
          </span>

          {/* Outlier threshold % */}
          <label className="flex items-center gap-2 text-muted">
            <span className="text-faint">Max deviation:</span>
            <input
              type="range"
              min="5"
              max="100"
              step="5"
              value={settings.outlierThresholdPct}
              onChange={(e) => onChangeSetting('outlierThresholdPct', Number(e.target.value))}
              className="h-1 w-20 cursor-pointer accent-[var(--color-accent)]"
            />
            <span className="inline-flex items-center gap-0.5">
              <span className="text-faint">±</span>
              <input
                type="number"
                min="0"
                max="500"
                step="1"
                value={settings.outlierThresholdPct}
                onChange={(e) => onChangeSetting('outlierThresholdPct', Math.max(0, Number(e.target.value) || 0))}
                className="num w-12 rounded-sm border border-rule bg-surface-2 px-1.5 py-0.5 text-right text-xs text-ink focus:border-accent focus:outline-none"
                aria-label="Accepted deviation percentage"
              />
              <span className="text-faint">%</span>
            </span>
          </label>

          {/* Include recurring in baseline */}
          <label className="flex cursor-pointer items-center gap-1.5 text-muted hover:text-ink">
            <input
              type="checkbox"
              checked={!!settings.includeRecurringInBaseline}
              onChange={(e) => onChangeSetting('includeRecurringInBaseline', e.target.checked)}
              className="h-3.5 w-3.5 cursor-pointer accent-[var(--color-accent)]"
            />
            <span>Include recurring</span>
          </label>
        </div>
      }
      bodyClassName="py-0"
    >
      {/* Summary bar comparing Raw Mean vs Outlier-Trimmed Mean */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-rule py-3 text-xs">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
          <span>
            <span className="text-faint">Raw avg spend: </span>
            <span className="num text-muted">{formatCurrency(baseline.rawAvgExpenses)}</span>
          </span>
          <span>
            <span className="text-faint">Trimmed avg spend: </span>
            <span className="num font-medium text-ink">{formatCurrency(baseline.trimmedAvgExpenses)}</span>
          </span>
          <span>
            <span className="text-faint">Trimmed avg income: </span>
            <span className="num text-accent">{formatCurrency(baseline.trimmedAvgIncome)}</span>
          </span>
          <span>
            <span className="text-faint">Split (trimmed): </span>
            <span className="num text-muted">{formatCurrency(baseline.trimmedAvgRecurring)}</span>
            <span className="text-faint"> recurring · </span>
            <span className="num text-muted">{formatCurrency(baseline.trimmedAvgOneTime)}</span>
            <span className="text-faint"> one-time</span>
          </span>
        </div>
        <div className="text-faint">
          {baseline.excludedCount > 0 ? (
            <span>
              Excluded <span className="num text-warn">{baseline.excludedCount}</span> outlier month{baseline.excludedCount !== 1 ? 's' : ''} (&gt; ±{baseline.outlierThresholdPct}% from {formatCurrency(baseline.rawAvgExpenses)})
              {baseline.allExcludedFallback && ' · all exceeded cap, using raw avg'}
            </span>
          ) : (
            <span>All active completed months are within ±{baseline.outlierThresholdPct}% of the mean</span>
          )}
        </div>
      </div>

      {/* Monthly breakdown table */}
      {baseline.months.length === 0 ? (
        <Empty>No completed months to analyze yet</Empty>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Completed Month</Th>
              <Th align="right">Income</Th>
              <Th align="right" className="hidden sm:table-cell">Recurring</Th>
              <Th align="right" className="hidden sm:table-cell">One-Time</Th>
              <Th align="right">Evaluated Spend</Th>
              <Th align="right">Deviation vs Mean</Th>
              <Th align="right">Status</Th>
            </tr>
          </thead>
          <tbody>
            {baseline.months.map((m) => {
              const dev = m.expenseDeviationPct;
              const absDev = Math.min(100, Math.abs(dev));
              return (
                <tr
                  key={m.key}
                  className={`${rowClass} ${m.isOutlier || !m.hasData ? 'opacity-45' : ''}`}
                >
                  <Td className="text-ink">{m.label}</Td>
                  <Td align="right">
                    <span className="num text-accent">{formatCurrency(m.income)}</span>
                  </Td>
                  <Td align="right" className="hidden sm:table-cell">
                    <span className="num text-muted">{formatCurrency(m.recurringExpenses)}</span>
                  </Td>
                  <Td align="right" className="hidden sm:table-cell">
                    <span className="num text-muted">{formatCurrency(m.oneTimeExpenses)}</span>
                  </Td>
                  <Td align="right">
                    <span className="num text-ink">{formatCurrency(m.expenses)}</span>
                  </Td>
                  <Td align="right">
                    {m.hasData ? (
                      <div className="inline-flex items-center justify-end gap-2">
                        <span className="hidden h-1 w-14 bg-rule md:inline-block" aria-hidden>
                          <span
                            className={`block h-full ${dev > 0 ? 'bg-debit' : 'bg-accent'}`}
                            style={{ width: `${absDev}%` }}
                          />
                        </span>
                        <span
                          className={`num text-xs ${
                            m.isOutlier
                              ? 'text-warn'
                              : dev > 0
                                ? 'text-debit'
                                : dev < 0
                                  ? 'text-accent'
                                  : 'text-muted'
                          }`}
                        >
                          {dev > 0 ? '+' : ''}{dev.toFixed(1)}%
                        </span>
                      </div>
                    ) : (
                      <span className="text-xs text-faint">—</span>
                    )}
                  </Td>
                  <Td align="right">
                    {!m.hasData ? (
                      <Tag>no data</Tag>
                    ) : m.isOutlier ? (
                      <Tag tone="warn">outlier · excluded</Tag>
                    ) : (
                      <Tag tone="accent">included</Tag>
                    )}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
    </Section>
  );
}

/* ── Module 2 & 3 UI: Spending Caps & Savings/Item Goals ──────── */
export function SpendingBucketsSection({
  spendingBuckets,
  selectedBucketId,
  onSelectBucket,
  onToggleBucketRecurring,
  onAddBucket,
  onEditBucket,
  onDeleteBucket,
  drilldownSlot,
}) {
  return (
    <Section
      className="mb-10"
      title="Monthly spending buckets"
      aside={
        <div className="flex items-center gap-4">
          <span className="hidden text-xs text-faint sm:inline">
            Click a bucket to inspect transactions · toggle recurring per bucket
          </span>
          <TextButton tone="accent" onClick={() => onAddBucket('spending_limit')}>
            + add spending bucket
          </TextButton>
        </div>
      }
      bodyClassName="py-0"
    >
      {spendingBuckets.length === 0 ? (
        <div className="py-8 text-center">
          <p className="mb-1 text-sm text-ink">No spending buckets yet</p>
          <p className="mb-4 text-xs text-muted">
            Create category caps to model how much you want to spend per month, with or without recurring bills.
          </p>
          <Button onClick={() => onAddBucket('spending_limit')}>Create spending bucket</Button>
        </div>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Bucket</Th>
              <Th className="hidden md:table-cell">Categories</Th>
              <Th>Recurring</Th>
              <Th align="right">This Month</Th>
              <Th align="right" className="hidden sm:table-cell">Trimmed Avg</Th>
              <Th align="right">Monthly Cap</Th>
              <Th align="right">Remaining</Th>
              <Th align="right"><span className="sr-only">Actions</span></Th>
            </tr>
          </thead>
          <tbody>
            {spendingBuckets.map((b) => {
              const isSelected = selectedBucketId === b.id;
              const barPct = Math.max(0, Math.min(100, b.utilizationPct));
              const barColor =
                b.status === 'over' ? 'bg-debit' : b.status === 'near' ? 'bg-warn' : 'bg-accent';
              const catLabel =
                Array.isArray(b.categories) && b.categories.length > 0
                  ? b.categories.join(', ')
                  : 'All categories';

              return (
                <tr
                  key={b.id}
                  className={`${rowClass} ${isSelected ? 'bg-surface-2' : ''}`}
                >
                  <Td>
                    <button
                      type="button"
                      onClick={() => onSelectBucket(isSelected ? null : b.id)}
                      className="cursor-pointer text-left font-medium text-ink underline-offset-4 hover:underline"
                    >
                      {b.name}
                    </button>
                    <div className="mt-1 h-0.5 w-28 bg-rule" aria-hidden>
                      <div className={`h-full ${barColor}`} style={{ width: `${barPct}%` }} />
                    </div>
                  </Td>
                  <Td className="hidden max-w-xs truncate text-xs text-muted md:table-cell" title={catLabel}>
                    {catLabel}
                  </Td>
                  <Td>
                    <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-muted hover:text-ink">
                      <input
                        type="checkbox"
                        checked={!!b.includeRecurring}
                        onChange={(e) => onToggleBucketRecurring(b.id, e.target.checked)}
                        className="h-3.5 w-3.5 cursor-pointer accent-[var(--color-accent)]"
                      />
                      <span>{b.includeRecurring ? 'included' : 'excluded'}</span>
                    </label>
                  </Td>
                  <Td align="right">
                    <span className={`num ${b.status === 'over' ? 'text-debit' : 'text-ink'}`}>
                      {formatCurrency(b.spentThisMonth)}
                    </span>
                  </Td>
                  <Td align="right" className="hidden sm:table-cell">
                    <span className="num text-muted">{formatCurrency(b.historicalTrimmedAvg)}</span>
                  </Td>
                  <Td align="right">
                    <span className="num text-ink">{formatCurrency(b.monthlyAmount)}</span>
                  </Td>
                  <Td align="right">
                    <span className={`num ${b.remaining >= 0 ? 'text-accent' : 'text-debit'}`}>
                      {b.remaining >= 0 ? formatCurrency(b.remaining) : `−${formatCurrency(Math.abs(b.remaining))}`}
                    </span>
                  </Td>
                  <Td align="right" className="whitespace-nowrap">
                    <span className="inline-flex gap-3">
                      <TextButton className="text-xs" onClick={() => onEditBucket(b)}>edit</TextButton>
                      <TextButton tone="debit" className="text-xs" onClick={() => onDeleteBucket(b.id)}>delete</TextButton>
                    </span>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
      {drilldownSlot}
    </Section>
  );
}

export function GoalBucketsSection({
  goalBuckets,
  onAddBucket,
  onEditBucket,
  onDeleteBucket,
}) {
  return (
    <Section
      className="mb-10"
      title="Savings & item goals"
      aside={
        <div className="flex items-center gap-4">
          <TextButton tone="accent" onClick={() => onAddBucket('savings_goal')}>
            + add savings goal
          </TextButton>
          <TextButton tone="accent" onClick={() => onAddBucket('item_goal')}>
            + save for item
          </TextButton>
        </div>
      }
      bodyClassName="py-0"
    >
      {goalBuckets.length === 0 ? (
        <div className="py-8 text-center">
          <p className="mb-1 text-sm text-ink">No savings or item goals yet</p>
          <p className="mb-4 text-xs text-muted">
            Add a monthly savings target or a specific purchase you want to save up for.
          </p>
          <div className="flex justify-center gap-3">
            <Button variant="secondary" onClick={() => onAddBucket('savings_goal')}>Add savings goal</Button>
            <Button onClick={() => onAddBucket('item_goal')}>Save for an item</Button>
          </div>
        </div>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Goal / Item</Th>
              <Th>Type</Th>
              <Th align="right">Monthly Set-Aside</Th>
              <Th align="right">Saved / Target</Th>
              <Th align="right" className="hidden sm:table-cell">Timeline</Th>
              <Th align="right"><span className="sr-only">Actions</span></Th>
            </tr>
          </thead>
          <tbody>
            {goalBuckets.map((g) => {
              const pct = g.progressPct ?? 0;
              return (
                <tr key={g.id} className={rowClass}>
                  <Td>
                    <div className="font-medium text-ink">{g.name}</div>
                    {g.targetAmount !== null && (
                      <div className="mt-1 h-0.5 w-28 bg-rule" aria-hidden>
                        <div className="h-full bg-accent" style={{ width: `${pct}%` }} />
                      </div>
                    )}
                  </Td>
                  <Td>
                    <Tag tone={g.type === 'item_goal' ? 'warn' : 'accent'}>
                      {g.type === 'item_goal' ? 'item' : 'savings'}
                    </Tag>
                  </Td>
                  <Td align="right">
                    <span className="num text-accent">+{formatCurrency(g.monthlyAmount)}/mo</span>
                  </Td>
                  <Td align="right">
                    {g.targetAmount !== null ? (
                      <span className="num text-ink">
                        {formatCurrency(g.startingSaved)}{' '}
                        <span className="text-faint">/ {formatCurrency(g.targetAmount)}</span>
                      </span>
                    ) : (
                      <span className="num text-muted">
                        {g.startingSaved > 0 ? `${formatCurrency(g.startingSaved)} saved` : 'ongoing'}
                      </span>
                    )}
                  </Td>
                  <Td align="right" className="hidden text-xs text-muted sm:table-cell">
                    {g.monthsToGoal !== null ? (
                      <span>
                        ~<span className="num text-ink">{g.monthsToGoal}</span> mo at current pace
                        {g.targetDate && g.requiredMonthlyForTargetDate !== null && (
                          <span className="block text-[11px] text-faint">
                            Need <span className="num text-muted">{formatCurrency(g.requiredMonthlyForTargetDate)}/mo</span> for {formatDate(g.targetDate)}
                          </span>
                        )}
                      </span>
                    ) : (
                      <span>Ongoing allocation</span>
                    )}
                  </Td>
                  <Td align="right" className="whitespace-nowrap">
                    <span className="inline-flex gap-3">
                      <TextButton className="text-xs" onClick={() => onEditBucket(g)}>edit</TextButton>
                      <TextButton tone="debit" className="text-xs" onClick={() => onDeleteBucket(g.id)}>delete</TextButton>
                    </span>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
    </Section>
  );
}

/* ── Module 4 UI: End-of-Horizon Savings Simulator ────────────── */
export function SavingsProjectionSection({
  projection,
  horizonMonths,
  onChangeHorizon,
}) {
  return (
    <Section
      title="Estimated savings simulator"
      aside={
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <span className="text-faint">Horizon:</span>
          {[3, 6, 12, 24, 36].map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => onChangeHorizon(m)}
              className={
                'num cursor-pointer px-1 transition-colors ' +
                (horizonMonths === m
                  ? 'text-ink underline decoration-accent underline-offset-4'
                  : 'text-muted hover:text-ink')
              }
            >
              {m}m
            </button>
          ))}
          <span className="inline-flex items-center gap-1">
            <input
              type="number"
              min="1"
              max="240"
              value={horizonMonths}
              onChange={(e) => onChangeHorizon(Math.max(1, Math.min(240, Number(e.target.value) || 1)))}
              className={`${inputClass} num !w-16 !px-2 !py-0.5 text-right text-xs`}
              aria-label="Custom horizon in months"
            />
            <span className="text-faint">mo ({projection.horizonEndLabel})</span>
          </span>
        </div>
      }
    >
      <div className="grid gap-8 lg:grid-cols-2">
        {/* Monthly waterfall */}
        <div>
          <h3 className="mb-2 text-xs text-muted">Monthly cash-flow model</h3>
          <dl className="divide-y divide-rule border-y border-rule text-sm">
            <div className="flex items-center justify-between py-2">
              <dt className="text-muted">Trimmed average monthly income</dt>
              <dd className="num text-accent">+{formatCurrency(projection.monthlyIncome)}</dd>
            </div>
            <div className="flex items-center justify-between py-2">
              <dt className="text-muted">Planned spending bucket caps</dt>
              <dd className="num text-debit">−{formatCurrency(projection.plannedBucketSpend)}</dd>
            </div>
            {projection.unbucketedRecurring > 0 && (
              <div className="flex items-center justify-between py-2">
                <dt className="text-muted">
                  Recurring bills excluded from buckets
                  <span className="block text-[11px] text-faint">Kept in model so bills aren&apos;t missed</span>
                </dt>
                <dd className="num text-debit">−{formatCurrency(projection.unbucketedRecurring)}</dd>
              </div>
            )}
            {projection.unbucketedCategorySpend > 0 && (
              <div className="flex items-center justify-between py-2">
                <dt className="text-muted">
                  Unbucketed categories (trimmed avg)
                </dt>
                <dd className="num text-debit">−{formatCurrency(projection.unbucketedCategorySpend)}</dd>
              </div>
            )}
            <div className="flex items-center justify-between py-2 font-medium">
              <dt className="text-ink">Estimated monthly savings (bucket plan)</dt>
              <dd className={`num ${projection.monthlySavingsBudgeted >= 0 ? 'text-accent' : 'text-debit'}`}>
                {projection.monthlySavingsBudgeted >= 0 ? '+' : '−'}
                {formatCurrency(Math.abs(projection.monthlySavingsBudgeted))}
              </dd>
            </div>
            <div className="flex items-center justify-between py-2 text-xs">
              <dt className="text-faint">Earmarked for savings &amp; item goals</dt>
              <dd className="num text-muted">−{formatCurrency(projection.plannedGoalContributions)}/mo</dd>
            </div>
            <div className="flex items-center justify-between py-2 text-xs">
              <dt className="text-faint">Unallocated monthly surplus / deficit</dt>
              <dd className={`num ${projection.unallocatedMonthlySurplus >= 0 ? 'text-ink' : 'text-debit'}`}>
                {projection.unallocatedMonthlySurplus >= 0 ? '+' : '−'}
                {formatCurrency(Math.abs(projection.unallocatedMonthlySurplus))}/mo
              </dd>
            </div>
          </dl>
        </div>

        {/* End of horizon comparison */}
        <div>
          <h3 className="mb-2 text-xs text-muted">
            Projected position after {projection.horizonMonths} month{projection.horizonMonths !== 1 ? 's' : ''} ({projection.horizonEndLabel})
          </h3>
          <dl className="divide-y divide-rule border-y border-rule text-sm">
            <div className="flex items-center justify-between py-2">
              <dt className="text-muted">Current total balance across accounts</dt>
              <dd className="num text-ink">{formatCurrency(projection.currentBalance)}</dd>
            </div>
            <div className="flex items-center justify-between py-2">
              <dt className="text-muted">
                Net savings added (bucket plan)
                <span className="block text-[11px] text-faint">
                  {formatCurrency(projection.projectedGoalAccumulation)} in goals · {formatCurrency(projection.projectedUnallocatedAccumulation)} unallocated
                </span>
              </dt>
              <dd className={`num font-medium ${projection.projectedNetSavingsBudgeted >= 0 ? 'text-accent' : 'text-debit'}`}>
                {projection.projectedNetSavingsBudgeted >= 0 ? '+' : '−'}
                {formatCurrency(Math.abs(projection.projectedNetSavingsBudgeted))}
              </dd>
            </div>
            <div className="flex items-center justify-between py-2">
              <dt className="text-muted">Projected total balance (bucket plan)</dt>
              <dd className="num text-base font-medium text-ink">
                {formatCurrency(projection.projectedBalanceBudgeted)}
              </dd>
            </div>
            <div className="flex items-center justify-between py-2 text-xs">
              <dt className="text-faint">
                If spending stays at historical trimmed avg ({formatCurrency(projection.monthlySavingsHistorical)}/mo net)
              </dt>
              <dd className="num text-muted">
                {formatCurrency(projection.projectedBalanceHistorical)}{' '}
                <span className="text-faint">
                  ({projection.projectedNetSavingsHistorical >= 0 ? '+' : '−'}
                  {formatCurrency(Math.abs(projection.projectedNetSavingsHistorical))})
                </span>
              </dd>
            </div>
          </dl>

          {projection.goalProjections.length > 0 && (
            <div className="mt-4">
              <h4 className="mb-1.5 text-xs text-faint">Goal balances by {projection.horizonEndLabel}</h4>
              <ul className="divide-y divide-rule border-y border-rule text-xs">
                {projection.goalProjections.map((gp) => (
                  <li key={gp.id} className="flex items-center justify-between py-1.5">
                    <span className="text-ink">{gp.name}</span>
                    <span className="num text-muted">
                      <span className="text-accent">{formatCurrency(gp.projectedAtHorizon)}</span>
                      {gp.targetAmount !== null && (
                        <>
                          {' / '}{formatCurrency(gp.targetAmount)}
                          {gp.willReachGoal && <span className="ml-1.5 text-accent">(reached)</span>}
                        </>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </Section>
  );
}
