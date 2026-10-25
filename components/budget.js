'use client';

/**
 * Presentational modules for the Top-Down Budget & Analytics page.
 * Flow:
 *   1. Avg Monthly Income (from completed-month baseline with separate income/spend deviation filter)
 *   2. Monthly Savings / Drawdown Target (% of income or $ amount)
 *   3. Item Buckets ("things I want to buy" with target payoff dates — lowers spendable pool)
 *   4. Percentage-Based Spending Buckets (% of remaining spendable pool, attributed by category, recurring rule, or transaction)
 *   5. Future Balance & Payoff Date Estimator
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

/* ── Top Tally Strip (The 4 numbers of the top-down budget) ───── */
export function BudgetTallyStrip({ baseline, bucketEval, projection }) {
  const savTarget = bucketEval.monthlySavingsTarget;
  const savPct = bucketEval.savingsTargetPct;
  const horizonNet = projection.projectedNetSavingsBudgeted;

  return (
    <Tally className="mb-10">
      <TallyItem
        label="Avg monthly income"
        value={formatCurrency(baseline.trimmedAvgIncome)}
        valueClassName="text-accent"
        detail={
          <span>
            avg spend <span className="num text-ink">{formatCurrency(baseline.trimmedAvgExpenses)}</span>/mo
          </span>
        }
      />
      <TallyItem
        label="Monthly savings target"
        value={`${savTarget >= 0 ? '+' : '−'}${formatCurrency(Math.abs(savTarget))}`}
        valueClassName={savTarget >= 0 ? 'text-accent' : 'text-debit'}
        detail={
          <span>
            <span className="num text-ink">{savPct >= 0 ? '+' : ''}{savPct}%</span> of avg income
          </span>
        }
      />
      <TallyItem
        label="Spendable pool (for % buckets)"
        value={formatCurrency(bucketEval.spendablePool)}
        detail={
          bucketEval.totalItemMonthlyCost > 0 ? (
            <span>
              after <span className="num text-warn">−{formatCurrency(bucketEval.totalItemMonthlyCost)}/mo</span> items
            </span>
          ) : (
            <span>
              <span className="num text-ink">{bucketEval.totalAllocatedPct}%</span> allocated in buckets
            </span>
          )
        }
      />
      <TallyItem
        label={`Est. balance (${projection.horizonEndLabel})`}
        value={formatCurrency(projection.projectedBalanceBudgeted)}
        detail={
          <span>
            <span className={`num ${horizonNet >= 0 ? 'text-accent' : 'text-debit'}`}>
              {horizonNet >= 0 ? '+' : '−'}{formatCurrency(Math.abs(horizonNet))}
            </span>
            {' over '}{projection.horizonMonths}m
          </span>
        }
      />
    </Tally>
  );
}

/* ── Step 1 UI: Monthly Savings / Drawdown Target ─────────────── */
export function SavingsTargetSection({
  bucketEval,
  settings,
  onChangeSetting,
}) {
  const mode = settings.savingsTargetMode || 'percent';
  const val = Number(settings.savingsTargetValue ?? 20);
  const avgIncome = bucketEval.avgIncome;
  const savTarget = bucketEval.monthlySavingsTarget;

  const handleModeSwitch = (nextMode) => {
    if (nextMode === mode) return;
    if (nextMode === 'amount') {
      const dollarVal = Math.round((avgIncome * val) / 100);
      onChangeSetting('savingsTargetMode', 'amount');
      onChangeSetting('savingsTargetValue', dollarVal);
    } else {
      const pctVal = avgIncome > 0 ? Number(((val / avgIncome) * 100).toFixed(1)) : 20;
      onChangeSetting('savingsTargetMode', 'percent');
      onChangeSetting('savingsTargetValue', pctVal);
    }
  };

  return (
    <Section
      className="mb-10"
      title="1. Monthly savings target"
      aside={
        <div className="flex items-center gap-2 text-xs">
          <span className="text-faint">Set target by:</span>
          <button
            type="button"
            onClick={() => handleModeSwitch('percent')}
            className={
              'cursor-pointer px-1.5 py-0.5 transition-colors ' +
              (mode === 'percent'
                ? 'text-ink underline decoration-accent underline-offset-4'
                : 'text-muted hover:text-ink')
            }
          >
            % of income
          </button>
          <span className="text-faint">·</span>
          <button
            type="button"
            onClick={() => handleModeSwitch('amount')}
            className={
              'cursor-pointer px-1.5 py-0.5 transition-colors ' +
              (mode === 'amount'
                ? 'text-ink underline decoration-accent underline-offset-4'
                : 'text-muted hover:text-ink')
            }
          >
            $ amount
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        {/* Target input + slider */}
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-ink">
            <span className="text-muted">
              {val >= 0 ? 'Save per month:' : 'Allowed monthly loss:'}
            </span>
            <div className="inline-flex items-center gap-1">
              {mode === 'amount' && <span className="text-muted">$</span>}
              <input
                type="number"
                step={mode === 'percent' ? '1' : '25'}
                value={val}
                onChange={(e) => onChangeSetting('savingsTargetValue', Number(e.target.value) || 0)}
                className={`${inputClass} num !w-24 !px-2 !py-1 text-right text-sm`}
                aria-label="Monthly savings target"
              />
              {mode === 'percent' && <span className="text-muted">%</span>}
            </div>
          </label>

          {mode === 'percent' && (
            <input
              type="range"
              min="-50"
              max="80"
              step="1"
              value={Math.max(-50, Math.min(80, val))}
              onChange={(e) => onChangeSetting('savingsTargetValue', Number(e.target.value))}
              className="h-1 w-36 cursor-pointer accent-[var(--color-accent)]"
              aria-label="Savings percentage slider"
            />
          )}

          <span className="text-xs text-faint">
            (use a negative value like <span className="num">-10</span> if you are okay losing that much per month)
          </span>
        </div>

        {/* Live top-down pool equation */}
        <div className="flex flex-wrap items-center gap-2 border-t border-rule pt-3 text-xs lg:border-t-0 lg:pt-0">
          <span>
            <span className="text-faint">Avg income </span>
            <span className="num text-accent">{formatCurrency(avgIncome)}</span>
          </span>
          <span className="text-faint">{savTarget >= 0 ? '−' : '+'}</span>
          <span>
            <span className="text-faint">{savTarget >= 0 ? 'Savings ' : 'Drawdown '}</span>
            <span className={`num ${savTarget >= 0 ? 'text-accent' : 'text-debit'}`}>
              {formatCurrency(Math.abs(savTarget))}
            </span>
          </span>
          {bucketEval.totalItemMonthlyCost > 0 && (
            <>
              <span className="text-faint">−</span>
              <span>
                <span className="text-faint">Items </span>
                <span className="num text-warn">{formatCurrency(bucketEval.totalItemMonthlyCost)}</span>
              </span>
            </>
          )}
          <span className="text-faint">=</span>
          <span>
            <span className="text-faint">Spendable base </span>
            <span className="num font-medium text-ink">{formatCurrency(bucketEval.spendablePool)}/mo</span>
          </span>
        </div>
      </div>
    </Section>
  );
}

/* ── Step 2 UI: Percentage-Based Spending Buckets ─────────────── */
export function SpendingBucketsSection({
  bucketEval,
  rulesMap,
  selectedBucketId,
  onSelectBucket,
  onChangeBucketPct,
  onAddBucket,
  onEditBucket,
  onDeleteBucket,
  drilldownSlot,
}) {
  const {
    spendingBuckets,
    spendablePool,
    totalItemMonthlyCost,
    totalAllocatedPct,
    unallocatedPct,
    totalSpendingCaps,
    unallocatedSpendableDollar,
  } = bucketEval;

  return (
    <Section
      className="mb-10"
      title="2. Spending buckets (% of spendable income)"
      aside={
        <div className="flex items-center gap-4">
          <span className="hidden text-xs text-faint sm:inline">
            Click a bucket name to inspect its transactions
          </span>
          <TextButton tone="accent" onClick={() => onAddBucket('spending_limit')}>
            + add spending bucket
          </TextButton>
        </div>
      }
      bodyClassName="py-0"
    >
      {/* Allocation summary bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-rule py-3 text-xs">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
          <span>
            <span className="text-faint">Spendable base: </span>
            <span className="num font-medium text-ink">{formatCurrency(spendablePool)}/mo</span>
          </span>
          <span>
            <span className="text-faint">Allocated: </span>
            <span className={`num font-medium ${totalAllocatedPct > 100 ? 'text-debit' : 'text-ink'}`}>
              {totalAllocatedPct}%
            </span>
            <span className="num text-muted"> ({formatCurrency(totalSpendingCaps)}/mo)</span>
          </span>
          <span>
            <span className="text-faint">{unallocatedPct >= 0 ? 'Unallocated buffer: ' : 'Over-allocated: '}</span>
            <span className={`num ${unallocatedPct >= 0 ? 'text-accent' : 'text-debit'}`}>
              {Math.abs(unallocatedPct).toFixed(1)}% ({formatCurrency(Math.abs(unallocatedSpendableDollar))}/mo)
            </span>
          </span>
        </div>
      </div>

      {spendingBuckets.length === 0 ? (
        <div className="py-8 text-center">
          <p className="mb-1 text-sm text-ink">No spending buckets yet</p>
          <p className="mb-4 text-xs text-muted">
            Create buckets, attribute categories or specific expenses, and assign each a % of your spendable income.
          </p>
          <Button onClick={() => onAddBucket('spending_limit')}>Create spending bucket</Button>
        </div>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Bucket</Th>
              <Th className="hidden md:table-cell">Attributed Expenses</Th>
              <Th align="right">% of Spendable</Th>
              <Th align="right">Max Spend / mo</Th>
              <Th align="right" className="hidden sm:table-cell">Usual Avg</Th>
              <Th align="right">Spent This Month</Th>
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

              // Build readable summary of attributed categories, recurring rules, and individual transactions
              const parts = [];
              if (Array.isArray(b.categories) && b.categories.length > 0) {
                parts.push(b.categories.join(', '));
              }
              if (Array.isArray(b.ruleIds) && b.ruleIds.length > 0) {
                const ruleNames = b.ruleIds
                  .map((id) => rulesMap?.get(String(id))?.name)
                  .filter(Boolean);
                parts.push(
                  ruleNames.length > 0
                    ? ruleNames.join(', ')
                    : `${b.ruleIds.length} recurring rule${b.ruleIds.length !== 1 ? 's' : ''}`
                );
              }
              if (Array.isArray(b.transactionIds) && b.transactionIds.length > 0) {
                parts.push(`${b.transactionIds.length} specific tx`);
              }
              const attrLabel = parts.length > 0 ? parts.join(' + ') : 'All expenses';

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
                  <Td className="hidden max-w-xs truncate text-xs text-muted md:table-cell" title={attrLabel}>
                    {attrLabel}
                    {b.includeRecurring === false && (
                      <span className="ml-1.5 text-[11px] text-faint">(one-time only)</span>
                    )}
                  </Td>
                  <Td align="right">
                    <div className="inline-flex items-center justify-end gap-1">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="1"
                        value={b.incomePercentage}
                        onChange={(e) =>
                          onChangeBucketPct(b.id, Math.max(0, Number(e.target.value) || 0))
                        }
                        className="num w-14 rounded-sm border border-rule bg-surface-2 px-1.5 py-0.5 text-right text-xs text-ink focus:border-accent focus:outline-none"
                        aria-label={`${b.name} percentage`}
                      />
                      <span className="text-xs text-muted">%</span>
                    </div>
                  </Td>
                  <Td align="right">
                    <span className="num font-medium text-ink">{formatCurrency(b.maxSpend)}</span>
                    {totalItemMonthlyCost > 0 && b.maxSpendWithoutItems !== b.maxSpend && (
                      <span className="block text-[11px] text-faint num">
                        {formatCurrency(b.maxSpendWithoutItems)} before items
                      </span>
                    )}
                  </Td>
                  <Td align="right" className="hidden sm:table-cell">
                    <span className="num text-muted">{formatCurrency(b.historicalTrimmedAvg)}</span>
                  </Td>
                  <Td align="right">
                    <span className={`num ${b.status === 'over' ? 'text-debit' : 'text-ink'}`}>
                      {formatCurrency(b.spentThisMonth)}
                    </span>
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

/* ── Step 3 UI: Extra Buckets for Things I Want to Buy ────────── */
export function GoalBucketsSection({
  goalBuckets,
  onAddBucket,
  onEditBucket,
  onDeleteBucket,
}) {
  return (
    <Section
      className="mb-10"
      title="3. Things to buy (item buckets)"
      aside={
        <div className="flex items-center gap-4">
          <span className="hidden text-xs text-faint sm:inline">
            Lowers your spendable pool without changing your spending bucket percentages
          </span>
          <TextButton tone="accent" onClick={() => onAddBucket('item_goal')}>
            + add item to buy
          </TextButton>
        </div>
      }
      bodyClassName="py-0"
    >
      {goalBuckets.length === 0 ? (
        <div className="py-8 text-center">
          <p className="mb-1 text-sm text-ink">No items queued to buy</p>
          <p className="mb-4 text-xs text-muted">
            Add things you want to buy with a target payoff date. Their monthly cost is taken out of your spendable pool before your bucket percentages are multiplied.
          </p>
          <Button onClick={() => onAddBucket('item_goal')}>Add item to buy</Button>
        </div>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Item</Th>
              <Th align="right">Price / Saved</Th>
              <Th align="right">Deducted From Pool</Th>
              <Th align="right">Estimated Payoff Date</Th>
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
                    {g.targetAmount > 0 && (
                      <div className="mt-1 h-0.5 w-28 bg-rule" aria-hidden>
                        <div className="h-full bg-warn" style={{ width: `${pct}%` }} />
                      </div>
                    )}
                  </Td>
                  <Td align="right">
                    <span className="num text-ink">
                      {formatCurrency(g.targetAmount)}
                    </span>
                    {g.startingSaved > 0 && (
                      <span className="block text-[11px] text-faint num">
                        {formatCurrency(g.startingSaved)} already saved
                      </span>
                    )}
                  </Td>
                  <Td align="right">
                    <span className="num text-warn">−{formatCurrency(g.effectiveMonthlyCost)}/mo</span>
                  </Td>
                  <Td align="right" className="text-xs text-muted">
                    {g.targetDate ? (
                      <span>
                        By <span className="num text-ink">{formatDate(g.targetDate)}</span>
                        {g.monthsUntilTargetDate !== null && (
                          <span className="text-faint"> ({g.monthsUntilTargetDate} mo)</span>
                        )}
                      </span>
                    ) : g.estimatedPayoffLabel ? (
                      <span>
                        Est. <span className="num text-ink">{g.estimatedPayoffLabel}</span>
                        {g.monthsToGoal !== null && (
                          <span className="text-faint"> (~{g.monthsToGoal} mo)</span>
                        )}
                      </span>
                    ) : (
                      <span>—</span>
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

/* ── Step 4 UI: Future Balance & Payoff Date Estimator ────────── */
export function SavingsProjectionSection({
  projection,
  horizonMonths,
  targetDateStr,
  onChangeHorizon,
  onChangeTargetDate,
}) {
  return (
    <Section
      className="mb-10"
      title="4. Future balance & payoff estimator"
      aside={
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <span className="text-faint">Estimate by:</span>
          {[3, 6, 12, 24].map((m) => (
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
          <input
            type="date"
            value={targetDateStr || projection.targetDateStr || ''}
            onChange={(e) => onChangeTargetDate(e.target.value)}
            className={`${inputClass} num !w-36 !px-2 !py-0.5 text-xs`}
            aria-label="Target future date for balance estimate"
          />
        </div>
      }
    >
      <div className="grid gap-8 lg:grid-cols-2">
        {/* Future Balance by Selected Date */}
        <div>
          <h3 className="mb-2 text-xs text-muted">
            Projected balance by {projection.horizonEndLabel} ({projection.horizonMonths} mo)
          </h3>
          <dl className="divide-y divide-rule border-y border-rule text-sm">
            <div className="flex items-center justify-between py-2.5">
              <dt className="text-muted">Current balance across accounts</dt>
              <dd className="num text-ink">{formatCurrency(projection.currentBalance)}</dd>
            </div>
            <div className="flex items-center justify-between py-2.5">
              <dt className="text-muted">
                Monthly savings target ({projection.savingsTargetPct >= 0 ? '+' : ''}{projection.savingsTargetPct}%)
              </dt>
              <dd className={`num ${projection.monthlySavingsBudgeted >= 0 ? 'text-accent' : 'text-debit'}`}>
                {projection.monthlySavingsBudgeted >= 0 ? '+' : '−'}
                {formatCurrency(Math.abs(projection.monthlySavingsBudgeted))}/mo
              </dd>
            </div>
            <div className="flex items-center justify-between py-2.5">
              <dt className="text-muted">
                Net change over {projection.horizonMonths} month{projection.horizonMonths !== 1 ? 's' : ''}
              </dt>
              <dd className={`num font-medium ${projection.projectedNetSavingsBudgeted >= 0 ? 'text-accent' : 'text-debit'}`}>
                {projection.projectedNetSavingsBudgeted >= 0 ? '+' : '−'}
                {formatCurrency(Math.abs(projection.projectedNetSavingsBudgeted))}
              </dd>
            </div>
            <div className="flex items-center justify-between py-2.5">
              <dt className="font-medium text-ink">Estimated balance on {projection.horizonEndLabel}</dt>
              <dd className="num text-base font-medium text-ink">
                {formatCurrency(projection.projectedBalanceBudgeted)}
              </dd>
            </div>
          </dl>
        </div>

        {/* Item Payoff Timeline */}
        <div>
          <h3 className="mb-2 text-xs text-muted">
            Item payoff status by {projection.horizonEndLabel}
          </h3>
          {projection.goalProjections.length === 0 ? (
            <div className="border-y border-rule py-6 text-center text-xs text-muted">
              No items queued in &ldquo;Things to buy&rdquo; yet.
            </div>
          ) : (
            <ul className="divide-y divide-rule border-y border-rule text-sm">
              {projection.goalProjections.map((gp) => (
                <li key={gp.id} className="flex items-center justify-between py-2.5">
                  <div>
                    <div className="font-medium text-ink">{gp.name}</div>
                    <div className="text-xs text-faint">
                      {gp.targetDate
                        ? `Target payoff: ${formatDate(gp.targetDate)}`
                        : gp.estimatedPayoffLabel
                          ? `Est. payoff: ${gp.estimatedPayoffLabel}`
                          : 'Ongoing'}
                      {' · '}
                      <span className="num">{formatCurrency(gp.monthlyAmount)}/mo</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="num text-ink">
                      <span className="text-accent">{formatCurrency(gp.projectedAtHorizon)}</span>
                      {gp.targetAmount !== null && (
                        <span className="text-faint"> / {formatCurrency(gp.targetAmount)}</span>
                      )}
                    </div>
                    {gp.willReachGoal !== null && (
                      <div className="mt-0.5">
                        {gp.willReachGoal ? (
                          <Tag tone="accent">paid off by {projection.horizonEndLabel}</Tag>
                        ) : (
                          <Tag tone="warn">in progress</Tag>
                        )}
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Section>
  );
}

/* ── Step 5 UI: Historical Baseline & Outlier Trimming ────────── */
export function BaselineSection({
  baseline,
  settings,
  onChangeSetting,
}) {
  return (
    <Section
      className="mb-10"
      title="5. Past months average & deviation filter"
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
