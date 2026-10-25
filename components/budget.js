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

/* ── Top Tally Strip (4 simple mental-budget numbers) ─────────── */
export function BudgetTallyStrip({ baseline, bucketEval, projection }) {
  const netMonthly = projection.monthlySavingsBudgeted;
  const horizonNet = projection.projectedNetSavingsBudgeted;
  const totalPlannedBuckets = bucketEval.totalSpendingCaps + bucketEval.totalGoalAllocations;

  return (
    <Tally className="mb-10">
      <TallyItem
        label="Avg monthly income"
        value={formatCurrency(baseline.trimmedAvgIncome)}
        valueClassName="text-accent"
        detail={
          <span>
            raw mean <span className="num text-muted">{formatCurrency(baseline.rawAvgIncome)}</span>
          </span>
        }
      />
      <TallyItem
        label="Avg monthly spend"
        value={formatCurrency(baseline.trimmedAvgExpenses)}
        detail={
          <span>
            raw mean <span className="num text-muted">{formatCurrency(baseline.rawAvgExpenses)}</span>
          </span>
        }
      />
      <TallyItem
        label="Planned in buckets"
        value={formatCurrency(totalPlannedBuckets)}
        detail={
          <span>
            <span className="num text-ink">{formatCurrency(bucketEval.totalSpendingCaps)}</span> spend ·{' '}
            <span className="num text-accent">{formatCurrency(bucketEval.totalGoalAllocations)}</span> goals
          </span>
        }
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
      title="Past months average & deviation filter"
      aside={
        <div className="flex flex-wrap items-center gap-4 text-xs">
          {/* Lookback selector */}
          <span className="flex items-center gap-1.5" role="group" aria-label="Lookback months">
            <span className="text-faint">Months:</span>
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
            <span className="text-faint">Accepted deviation:</span>
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
        </div>
      }
      bodyClassName="py-0"
    >
      {/* Simple 3-number summary bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-rule py-3 text-xs">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
          <span>
            <span className="text-faint">Avg income: </span>
            <span className="num font-medium text-accent">{formatCurrency(baseline.trimmedAvgIncome)}</span>
            {baseline.rawAvgIncome !== baseline.trimmedAvgIncome && (
              <span className="num text-faint"> (raw {formatCurrency(baseline.rawAvgIncome)})</span>
            )}
          </span>
          <span>
            <span className="text-faint">Avg spend: </span>
            <span className="num font-medium text-ink">{formatCurrency(baseline.trimmedAvgExpenses)}</span>
            {baseline.rawAvgExpenses !== baseline.trimmedAvgExpenses && (
              <span className="num text-faint"> (raw {formatCurrency(baseline.rawAvgExpenses)})</span>
            )}
          </span>
          <span>
            <span className="text-faint">Avg saved: </span>
            <span className={`num font-medium ${baseline.trimmedAvgNet >= 0 ? 'text-accent' : 'text-debit'}`}>
              {baseline.trimmedAvgNet >= 0 ? '+' : '−'}{formatCurrency(Math.abs(baseline.trimmedAvgNet))}/mo
            </span>
          </span>
        </div>
        <div className="text-faint">
          {baseline.excludedCount > 0 ? (
            <span>
              Trimmed <span className="num text-warn">{baseline.excludedCount}</span> month{baseline.excludedCount !== 1 ? 's' : ''} outside ±{baseline.outlierThresholdPct}% of mean income or spend
            </span>
          ) : (
            <span>All months within ±{baseline.outlierThresholdPct}% of mean income &amp; spend</span>
          )}
        </div>
      </div>

      {/* Monthly breakdown table with separate Income Deviation and Spend Deviation */}
      {baseline.months.length === 0 ? (
        <Empty>No completed months to analyze yet</Empty>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Month</Th>
              <Th align="right">Income (vs mean)</Th>
              <Th align="right">Spent (vs mean)</Th>
              <Th align="right" className="hidden sm:table-cell">Saved</Th>
              <Th align="right">Status</Th>
            </tr>
          </thead>
          <tbody>
            {baseline.months.map((m) => {
              const incDev = m.incomeDeviationPct;
              const expDev = m.expenseDeviationPct;

              let statusTag;
              if (!m.hasData) {
                statusTag = <Tag>no data</Tag>;
              } else if (m.isIncomeOutlier && m.isExpenseOutlier) {
                statusTag = <Tag tone="warn">income &amp; spend outlier</Tag>;
              } else if (m.isIncomeOutlier) {
                statusTag = <Tag tone="warn">income outlier</Tag>;
              } else if (m.isExpenseOutlier) {
                statusTag = <Tag tone="warn">spend outlier</Tag>;
              } else {
                statusTag = <Tag tone="accent">included</Tag>;
              }

              return (
                <tr
                  key={m.key}
                  className={`${rowClass} ${!m.hasData ? 'opacity-45' : ''}`}
                >
                  <Td className="text-ink">{m.label}</Td>

                  {/* Income + Deviation vs Mean Income */}
                  <Td align="right">
                    <div className={`inline-flex flex-wrap items-baseline justify-end gap-2 ${m.isIncomeOutlier ? 'opacity-55' : ''}`}>
                      <span className="num text-accent">{formatCurrency(m.income)}</span>
                      {m.hasData && (
                        <span
                          className={`num text-xs ${
                            m.isIncomeOutlier
                              ? 'text-warn'
                              : incDev > 0
                                ? 'text-accent'
                                : incDev < 0
                                  ? 'text-debit'
                                  : 'text-faint'
                          }`}
                        >
                          ({incDev > 0 ? '+' : ''}{incDev.toFixed(1)}%)
                        </span>
                      )}
                    </div>
                  </Td>

                  {/* Spent + Deviation vs Mean Spend */}
                  <Td align="right">
                    <div className={`inline-flex flex-wrap items-baseline justify-end gap-2 ${m.isExpenseOutlier ? 'opacity-55' : ''}`}>
                      <span className="num text-ink">{formatCurrency(m.expenses)}</span>
                      {m.hasData && (
                        <span
                          className={`num text-xs ${
                            m.isExpenseOutlier
                              ? 'text-warn'
                              : expDev > 0
                                ? 'text-debit'
                                : expDev < 0
                                  ? 'text-accent'
                                  : 'text-faint'
                          }`}
                        >
                          ({expDev > 0 ? '+' : ''}{expDev.toFixed(1)}%)
                        </span>
                      )}
                    </div>
                  </Td>

                  {/* Net Saved */}
                  <Td align="right" className="hidden sm:table-cell">
                    {m.hasData ? (
                      <span className={`num ${m.net >= 0 ? 'text-accent' : 'text-debit'}`}>
                        {m.net >= 0 ? '+' : '−'}{formatCurrency(Math.abs(m.net))}
                      </span>
                    ) : (
                      <span className="text-xs text-faint">—</span>
                    )}
                  </Td>

                  {/* Outlier Status */}
                  <Td align="right">{statusTag}</Td>
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
            Click a bucket to view its transactions
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
            Set max monthly spend limits for specific categories or your overall spending.
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
              <Th align="right">Spent This Month</Th>
              <Th align="right">Monthly Limit</Th>
              <Th align="right">Left</Th>
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
                        checked={b.includeRecurring !== false}
                        onChange={(e) => onToggleBucketRecurring(b.id, e.target.checked)}
                        className="h-3.5 w-3.5 cursor-pointer accent-[var(--color-accent)]"
                      />
                      <span>{b.includeRecurring !== false ? 'included' : 'excluded'}</span>
                    </label>
                  </Td>
                  <Td align="right">
                    <span className={`num ${b.status === 'over' ? 'text-debit' : 'text-ink'}`}>
                      {formatCurrency(b.spentThisMonth)}
                    </span>
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
              <Th align="right">Monthly Set-Aside</Th>
              <Th align="right">Progress</Th>
              <Th align="right" className="hidden sm:table-cell">Time Left</Th>
              <Th align="right"><span className="sr-only">Actions</span></Th>
            </tr>
          </thead>
          <tbody>
            {goalBuckets.map((g) => {
              const pct = g.progressPct ?? 0;
              return (
                <tr key={g.id} className={rowClass}>
                  <Td>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-ink">{g.name}</span>
                      <Tag tone={g.type === 'item_goal' ? 'warn' : 'accent'}>
                        {g.type === 'item_goal' ? 'item' : 'savings'}
                      </Tag>
                    </div>
                    {g.targetAmount !== null && (
                      <div className="mt-1 h-0.5 w-28 bg-rule" aria-hidden>
                        <div className="h-full bg-accent" style={{ width: `${pct}%` }} />
                      </div>
                    )}
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
                        ~<span className="num text-ink">{g.monthsToGoal}</span> mo left
                        {g.targetDate && g.requiredMonthlyForTargetDate !== null && (
                          <span className="block text-[11px] text-faint">
                            Need <span className="num text-muted">{formatCurrency(g.requiredMonthlyForTargetDate)}/mo</span> by {formatDate(g.targetDate)}
                          </span>
                        )}
                      </span>
                    ) : (
                      <span>Ongoing</span>
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

/* ── Module 4 UI: End-of-Horizon Savings Simulator (Simplified) ── */
export function SavingsProjectionSection({
  projection,
  horizonMonths,
  onChangeHorizon,
}) {
  return (
    <Section
      title="Estimated savings"
      aside={
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <span className="text-faint">Timeframe:</span>
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
        {/* Simple Monthly Math */}
        <div>
          <h3 className="mb-2 text-xs text-muted">Monthly budget math</h3>
          <dl className="divide-y divide-rule border-y border-rule text-sm">
            <div className="flex items-center justify-between py-2.5">
              <dt className="text-muted">Avg monthly income</dt>
              <dd className="num text-accent">+{formatCurrency(projection.monthlyIncome)}</dd>
            </div>
            <div className="flex items-center justify-between py-2.5">
              <dt className="text-muted">
                Expected monthly spend
                {projection.plannedBucketSpend > 0 && projection.unbucketedCategorySpend > 0 && (
                  <span className="block text-[11px] text-faint">
                    {formatCurrency(projection.plannedBucketSpend)} in buckets + {formatCurrency(projection.unbucketedCategorySpend + projection.unbucketedRecurring)} other usual spend
                  </span>
                )}
              </dt>
              <dd className="num text-debit">−{formatCurrency(projection.totalEffectiveMonthlySpend)}</dd>
            </div>
            <div className="flex items-center justify-between py-2.5 font-medium">
              <dt className="text-ink">
                Estimated saved per month
                {projection.plannedGoalContributions > 0 && (
                  <span className="block text-[11px] font-normal text-faint">
                    {formatCurrency(projection.plannedGoalContributions)}/mo into goals ·{' '}
                    {projection.unallocatedMonthlySurplus >= 0 ? '+' : '−'}
                    {formatCurrency(Math.abs(projection.unallocatedMonthlySurplus))}/mo extra cash
                  </span>
                )}
              </dt>
              <dd className={`num ${projection.monthlySavingsBudgeted >= 0 ? 'text-accent' : 'text-debit'}`}>
                {projection.monthlySavingsBudgeted >= 0 ? '+' : '−'}
                {formatCurrency(Math.abs(projection.monthlySavingsBudgeted))}/mo
              </dd>
            </div>
          </dl>
        </div>

        {/* Simple End-of-Horizon Outcome */}
        <div>
          <h3 className="mb-2 text-xs text-muted">
            After {projection.horizonMonths} month{projection.horizonMonths !== 1 ? 's' : ''} ({projection.horizonEndLabel})
          </h3>
          <dl className="divide-y divide-rule border-y border-rule text-sm">
            <div className="flex items-center justify-between py-2.5">
              <dt className="text-muted">Current balance</dt>
              <dd className="num text-ink">{formatCurrency(projection.currentBalance)}</dd>
            </div>
            <div className="flex items-center justify-between py-2.5">
              <dt className="text-muted">
                Estimated savings added ({projection.horizonMonths} mo)
              </dt>
              <dd className={`num font-medium ${projection.projectedNetSavingsBudgeted >= 0 ? 'text-accent' : 'text-debit'}`}>
                {projection.projectedNetSavingsBudgeted >= 0 ? '+' : '−'}
                {formatCurrency(Math.abs(projection.projectedNetSavingsBudgeted))}
              </dd>
            </div>
            <div className="flex items-center justify-between py-2.5">
              <dt className="font-medium text-ink">Estimated ending balance</dt>
              <dd className="num text-base font-medium text-ink">
                {formatCurrency(projection.projectedBalanceBudgeted)}
              </dd>
            </div>
          </dl>

          {projection.goalProjections.length > 0 && (
            <div className="mt-4">
              <h4 className="mb-1.5 text-xs text-faint">Goals by {projection.horizonEndLabel}</h4>
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
