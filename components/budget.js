'use client';

import { formatCurrency, formatDate } from '@/lib/calculation-engine';
import {
  Tally, TallyItem, Section, Table, Th, Td,
  rowClass, Tag, TextButton, Button, Empty, inputClass,
} from '@/components/ui';

const signedCurrency = (n) => `${n >= 0 ? '+' : '−'}${formatCurrency(Math.abs(n))}`;

/* ── Top Tally Strip (The 4 numbers of the top-down budget) ───── */
export function BudgetTallyStrip({ baseline, bucketEval, projection }) {
  const savTarget = bucketEval.monthlySavingsTarget + bucketEval.totalSavingsPlaceholderDollar;
  const savPct = bucketEval.savingsTargetPct;
  const horizonNet = projection.projectedNetSavingsBudgeted;

  return (
    <Tally className="mb-10">
      <TallyItem
        label="Avg monthly income"
        value={formatCurrency(baseline.trimmedAvgIncome)}
        valueClassName="text-accent"
        detail={<span>avg spend <span className="num text-ink">{formatCurrency(baseline.trimmedAvgExpenses)}</span>/mo</span>}
      />
      <TallyItem
        label="Monthly savings target"
        value={signedCurrency(savTarget)}
        valueClassName={savTarget >= 0 ? 'text-accent' : 'text-debit'}
        detail={
          bucketEval.totalSavingsPlaceholderDollar > 0 ? (
            <span>
              <span className="num text-ink">{savPct >= 0 ? '+' : ''}{savPct}%</span> base +{' '}
              <span className="num text-accent">{formatCurrency(bucketEval.totalSavingsPlaceholderDollar)}</span> bucket
            </span>
          ) : (
            <span><span className="num text-ink">{savPct >= 0 ? '+' : ''}{savPct}%</span> of avg income</span>
          )
        }
      />
      <TallyItem
        label="Spendable pool (for % buckets)"
        value={formatCurrency(bucketEval.spendablePool)}
        detail={
          bucketEval.totalItemMonthlyCost > 0 ? (
            <span>after <span className="num text-warn">−{formatCurrency(bucketEval.totalItemMonthlyCost)}/mo</span> spending buckets</span>
          ) : (
            <span><span className="num text-ink">{bucketEval.totalAllocatedPct}%</span> allocated in buckets</span>
          )
        }
      />
      <TallyItem
        label={`Est. balance (${projection.horizonEndLabel})`}
        value={formatCurrency(projection.projectedBalanceBudgeted)}
        detail={
          <span>
            <span className={`num ${horizonNet >= 0 ? 'text-accent' : 'text-debit'}`}>{signedCurrency(horizonNet)}</span>
            {' over '}{projection.horizonMonths}m
          </span>
        }
      />
    </Tally>
  );
}

/* ── Step 1 UI: Monthly Savings / Drawdown Target ─────────────── */
export function SavingsTargetSection({ bucketEval, settings, onChangeSetting }) {
  const mode = settings.savingsTargetMode || 'percent';
  const rawVal = settings.savingsTargetValue;
  const numVal = Number(rawVal) || 0;
  const { avgIncome, monthlySavingsTarget: savTarget, totalItemMonthlyCost, spendablePool } = bucketEval;

  const handleModeSwitch = (nextMode) => {
    if (nextMode === mode) return;
    onChangeSetting('savingsTargetMode', nextMode);
    onChangeSetting(
      'savingsTargetValue',
      nextMode === 'amount'
        ? Math.round((avgIncome * numVal) / 100)
        : avgIncome > 0 ? Number(((numVal / avgIncome) * 100).toFixed(1)) : 20
    );
  };

  return (
    <Section
      className="mb-10"
      title="1. Monthly savings target"
      aside={
        <div className="flex items-center gap-2 text-xs">
          <span className="text-faint">Set target by:</span>
          {[['percent', '% of income'], ['amount', '$ amount']].map(([m, label], idx) => (
            <span key={m} className="inline-flex items-center gap-2">
              {idx > 0 && <span className="text-faint">·</span>}
              <button
                type="button"
                onClick={() => handleModeSwitch(m)}
                className={`cursor-pointer px-1.5 py-0.5 transition-colors ${mode === m ? 'text-ink underline decoration-accent underline-offset-4' : 'text-muted hover:text-ink'}`}
              >
                {label}
              </button>
            </span>
          ))}
        </div>
      }
    >
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-ink">
            <span className="text-muted">{numVal >= 0 ? 'Save per month:' : 'Allowed monthly loss:'}</span>
            <div className="inline-flex items-center gap-1">
              {mode === 'amount' && <span className="text-muted">$</span>}
              <input
                type="number"
                step={mode === 'percent' ? '1' : '25'}
                value={rawVal === '' ? '' : rawVal ?? 20}
                onChange={(e) => onChangeSetting('savingsTargetValue', e.target.value === '' ? '' : Number(e.target.value))}
                onBlur={(e) => { if (e.target.value === '') onChangeSetting('savingsTargetValue', 0); }}
                className={`${inputClass} num !w-24 !px-2 !py-1 text-right text-sm`}
                aria-label="Monthly savings target"
              />
              {mode === 'percent' && <span className="text-muted">%</span>}
            </div>
          </label>
          {mode === 'percent' && (
            <input
              type="range" min="-50" max="80" step="1"
              value={Math.max(-50, Math.min(80, numVal))}
              onChange={(e) => onChangeSetting('savingsTargetValue', Number(e.target.value))}
              className="h-1 w-36 cursor-pointer accent-[var(--color-accent)]"
              aria-label="Savings percentage slider"
            />
          )}
          <span className="text-xs text-faint">(negative like <span className="num">-10</span> = allowed monthly drawdown)</span>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-rule pt-3 text-xs lg:border-t-0 lg:pt-0">
          <span><span className="text-faint">Avg income </span><span className="num text-accent">{formatCurrency(avgIncome)}</span></span>
          <span className="text-faint">{savTarget >= 0 ? '−' : '+'}</span>
          <span>
            <span className="text-faint">{savTarget >= 0 ? 'Savings ' : 'Drawdown '}</span>
            <span className={`num ${savTarget >= 0 ? 'text-accent' : 'text-debit'}`}>{formatCurrency(Math.abs(savTarget))}</span>
          </span>
          {totalItemMonthlyCost > 0 && (
            <>
              <span className="text-faint">−</span>
              <span><span className="text-faint">Spending buckets </span><span className="num text-warn">{formatCurrency(totalItemMonthlyCost)}</span></span>
            </>
          )}
          <span className="text-faint">=</span>
          <span><span className="text-faint">Spendable base </span><span className="num font-medium text-ink">{formatCurrency(spendablePool)}/mo</span></span>
        </div>
      </div>
    </Section>
  );
}

/* ── Step 2 UI: Unified Buckets (% Category, % Savings Placeholder, & Purchase Spending Buckets) */
export function SpendingBucketsSection({
  bucketEval, rulesMap, selectedBucketId, onSelectBucket,
  onChangeBucketPct, onBlurBucketPct, onAddBucket, onEditBucket, onDeleteBucket, drilldownSlot,
}) {
  const {
    allBuckets, spendablePool, totalItemMonthlyCost, totalAllocatedPct,
    unallocatedPct, totalSpendingCaps, totalSavingsPlaceholderDollar, unallocatedSpendableDollar,
  } = bucketEval;

  return (
    <Section
      className="mb-10"
      title="2. Budget buckets"
      aside={
        <div className="flex flex-wrap items-center gap-4">
          <TextButton tone="accent" onClick={() => onAddBucket('spending_limit')}>+ category bucket</TextButton>
          <TextButton tone="accent" onClick={() => onAddBucket('item_goal')}>+ spending bucket</TextButton>
          <TextButton tone="accent" onClick={() => onAddBucket('savings_placeholder')}>+ savings placeholder</TextButton>
        </div>
      }
      bodyClassName="py-0"
    >
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-rule py-3 text-xs">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
          <span><span className="text-faint">Spendable base: </span><span className="num font-medium text-ink">{formatCurrency(spendablePool)}/mo</span></span>
          <span>
            <span className="text-faint">Allocated: </span>
            <span className={`num font-medium ${totalAllocatedPct > 100 ? 'text-debit' : 'text-ink'}`}>{totalAllocatedPct}%</span>
            <span className="num text-muted"> ({formatCurrency(totalSpendingCaps + totalSavingsPlaceholderDollar)}/mo)</span>
          </span>
          {totalItemMonthlyCost > 0 && (
            <span><span className="text-faint">Pre-% spending buckets: </span><span className="num text-warn">−{formatCurrency(totalItemMonthlyCost)}/mo</span></span>
          )}
          <span>
            <span className="text-faint">{unallocatedPct >= 0 ? 'Unallocated: ' : 'Over-allocated: '}</span>
            <span className={`num ${unallocatedPct >= 0 ? 'text-accent' : 'text-debit'}`}>
              {Math.abs(unallocatedPct).toFixed(1)}% ({formatCurrency(Math.abs(unallocatedSpendableDollar))}/mo)
            </span>
          </span>
        </div>
      </div>

      {allBuckets.length === 0 ? (
        <div className="py-8 text-center">
          <p className="mb-1 text-sm text-ink">No buckets in your budget yet</p>
          <p className="mb-4 text-xs text-muted">Add % category buckets, spending buckets for things you want to buy, or a % savings placeholder.</p>
          <div className="flex flex-wrap justify-center gap-3">
            <Button onClick={() => onAddBucket('spending_limit')}>Add category bucket</Button>
            <Button variant="secondary" onClick={() => onAddBucket('item_goal')}>Add spending bucket</Button>
            <Button variant="secondary" onClick={() => onAddBucket('savings_placeholder')}>Add savings placeholder</Button>
          </div>
        </div>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Bucket</Th>
              <Th className="hidden md:table-cell">Details / Attributed</Th>
              <Th align="right">% of Spendable</Th>
              <Th align="right">Monthly Amount</Th>
              <Th align="right" className="hidden sm:table-cell">Usual Avg</Th>
              <Th align="right">This Month / Progress</Th>
              <Th align="right">Left</Th>
              <Th align="right"><span className="sr-only">Actions</span></Th>
            </tr>
          </thead>
          <tbody>
            {allBuckets.map((b) => {
              const isItem = b.type === 'item_goal';
              const isSavings = b.type === 'savings_placeholder';
              const isCategory = !isItem && !isSavings;
              const isSelected = isCategory && selectedBucketId === b.id;

              let detailsText = '';
              if (isItem) {
                detailsText = `Target ${formatCurrency(b.targetAmount)}${b.targetDate ? ` · Paid by ${formatDate(b.targetDate)}` : b.estimatedPayoffLabel ? ` · Est. ${b.estimatedPayoffLabel}` : ''}`;
              } else if (isSavings) {
                detailsText = 'Placeholder — reserves % of spendable pool for savings';
              } else {
                const parts = [];
                if (b.categories?.length) parts.push(b.categories.join(', '));
                if (b.ruleIds?.length) {
                  const names = b.ruleIds.map((id) => rulesMap?.get(String(id))?.name).filter(Boolean);
                  parts.push(names.length ? names.join(', ') : `${b.ruleIds.length} recurring rule${b.ruleIds.length !== 1 ? 's' : ''}`);
                }
                if (b.transactionIds?.length) parts.push(`${b.transactionIds.length} specific tx`);
                detailsText = parts.length ? parts.join(' + ') : 'All expenses';
              }

              const barPct = isItem ? (b.progressPct ?? 0) : Math.max(0, Math.min(100, b.utilizationPct || 0));
              const barColor = isItem ? 'bg-warn' : b.status === 'over' ? 'bg-debit' : b.status === 'near' ? 'bg-warn' : 'bg-accent';

              return (
                <tr key={b.id} className={`${rowClass} ${isSelected ? 'bg-surface-2' : ''}`}>
                  <Td>
                    <div className="flex items-center gap-2">
                      {isCategory ? (
                        <button type="button" onClick={() => onSelectBucket(isSelected ? null : b.id)} className="cursor-pointer text-left font-medium text-ink underline-offset-4 hover:underline">
                          {b.name}
                        </button>
                      ) : (
                        <span className="font-medium text-ink">{b.name}</span>
                      )}
                      {isItem && <Tag tone="warn">spending bucket</Tag>}
                      {isSavings && <Tag tone="accent">savings</Tag>}
                    </div>
                    {(isCategory || (isItem && b.targetAmount > 0)) && (
                      <div className="mt-1 h-0.5 w-28 bg-rule" aria-hidden>
                        <div className={`h-full ${barColor}`} style={{ width: `${barPct}%` }} />
                      </div>
                    )}
                  </Td>
                  <Td className={`hidden max-w-xs truncate text-xs md:table-cell ${isSavings ? 'text-faint' : 'text-muted'}`} title={detailsText}>
                    {detailsText}
                    {isCategory && b.includeRecurring === false && <span className="ml-1.5 text-[11px] text-faint">(one-time only)</span>}
                  </Td>
                  <Td align="right">
                    {isItem ? (
                      <span className="text-xs text-faint" title="Deducted from spendable pool before % buckets are multiplied">pre-% pool</span>
                    ) : (
                      <div className="inline-flex items-center justify-end gap-1">
                        <input
                          type="number" min="0" max="100" step="any"
                          value={b.rawIncomePercentage}
                          onChange={(e) => onChangeBucketPct(b.id, e.target.value)}
                          onBlur={(e) => onBlurBucketPct(b.id, e.target.value)}
                          className="num w-14 rounded-sm border border-rule bg-surface-2 px-1.5 py-0.5 text-right text-xs text-ink focus:border-accent focus:outline-none"
                          aria-label={`${b.name} percentage`}
                        />
                        <span className="text-xs text-muted">%</span>
                      </div>
                    )}
                  </Td>
                  <Td align="right">
                    {isItem ? (
                      <span className="num font-medium text-warn">−{formatCurrency(b.effectiveMonthlyCost)}/mo</span>
                    ) : (
                      <>
                        <span className={`num font-medium ${isSavings ? 'text-accent' : 'text-ink'}`}>{isSavings ? '+' : ''}{formatCurrency(b.maxSpend)}</span>
                        {totalItemMonthlyCost > 0 && b.maxSpendWithoutItems !== b.maxSpend && (
                          <span className="block text-[11px] text-faint num">{formatCurrency(b.maxSpendWithoutItems)} before spending buckets</span>
                        )}
                      </>
                    )}
                  </Td>
                  <Td align="right" className="hidden sm:table-cell">
                    {isCategory ? <span className="num text-muted">{formatCurrency(b.historicalTrimmedAvg)}</span> : <span className="text-xs text-faint">—</span>}
                  </Td>
                  <Td align="right">
                    {isItem ? (
                      <span className="num text-xs text-muted">{formatCurrency(b.startingSaved)} / {formatCurrency(b.targetAmount)}</span>
                    ) : isSavings ? (
                      <span className="text-xs text-faint">—</span>
                    ) : (
                      <span className={`num ${b.status === 'over' ? 'text-debit' : 'text-ink'}`}>{formatCurrency(b.spentThisMonth)}</span>
                    )}
                  </Td>
                  <Td align="right">
                    {isItem ? (
                      <span className="num text-xs text-muted">{b.monthsToGoal !== null ? `~${b.monthsToGoal} mo` : '—'}</span>
                    ) : isSavings ? (
                      <span className="num text-accent">+{formatCurrency(b.maxSpend)}</span>
                    ) : (
                      <span className={`num ${b.remaining >= 0 ? 'text-accent' : 'text-debit'}`}>
                        {b.remaining >= 0 ? formatCurrency(b.remaining) : `−${formatCurrency(Math.abs(b.remaining))}`}
                      </span>
                    )}
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

/* ── Step 3 UI: Future Balance & Payoff Date Estimator ────────── */
export function SavingsProjectionSection({ projection, horizonMonths, targetDateStr, onChangeHorizon, onChangeTargetDate }) {
  return (
    <Section
      className="mb-10"
      title="3. Future balance & payoff estimator"
      aside={
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <span className="text-faint">Estimate by:</span>
          {[3, 6, 12, 24].map((m) => (
            <button
              key={m} type="button" onClick={() => onChangeHorizon(m)}
              className={`num cursor-pointer px-1 transition-colors ${horizonMonths === m ? 'text-ink underline decoration-accent underline-offset-4' : 'text-muted hover:text-ink'}`}
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
        <div>
          <h3 className="mb-2 text-xs text-muted">Projected balance by {projection.horizonEndLabel} ({projection.horizonMonths} mo)</h3>
          <dl className="divide-y divide-rule border-y border-rule text-sm">
            <div className="flex items-center justify-between py-2.5">
              <dt className="text-muted">Current balance across accounts</dt>
              <dd className="num text-ink">{formatCurrency(projection.currentBalance)}</dd>
            </div>
            <div className="flex items-center justify-between py-2.5">
              <dt className="text-muted">
                Monthly savings ({projection.savingsTargetPct >= 0 ? '+' : ''}{projection.savingsTargetPct}%
                {projection.totalSavingsPlaceholderDollar > 0 ? ` + ${formatCurrency(projection.totalSavingsPlaceholderDollar)} savings bucket` : ''})
              </dt>
              <dd className={`num ${projection.monthlySavingsBudgeted >= 0 ? 'text-accent' : 'text-debit'}`}>{signedCurrency(projection.monthlySavingsBudgeted)}/mo</dd>
            </div>
            <div className="flex items-center justify-between py-2.5">
              <dt className="text-muted">Net change over {projection.horizonMonths} month{projection.horizonMonths !== 1 ? 's' : ''}</dt>
              <dd className={`num font-medium ${projection.projectedNetSavingsBudgeted >= 0 ? 'text-accent' : 'text-debit'}`}>{signedCurrency(projection.projectedNetSavingsBudgeted)}</dd>
            </div>
            <div className="flex items-center justify-between py-2.5">
              <dt className="font-medium text-ink">Estimated balance on {projection.horizonEndLabel}</dt>
              <dd className="num text-base font-medium text-ink">{formatCurrency(projection.projectedBalanceBudgeted)}</dd>
            </div>
          </dl>
        </div>

        <div>
          <h3 className="mb-2 text-xs text-muted">Spending bucket payoff status by {projection.horizonEndLabel}</h3>
          {projection.goalProjections.length === 0 ? (
            <div className="border-y border-rule py-6 text-center text-xs text-muted">No purchase spending buckets queued yet.</div>
          ) : (
            <ul className="divide-y divide-rule border-y border-rule text-sm">
              {projection.goalProjections.map((gp) => (
                <li key={gp.id} className="flex items-center justify-between py-2.5">
                  <div>
                    <div className="font-medium text-ink">{gp.name}</div>
                    <div className="text-xs text-faint">
                      {gp.targetDate ? `Target payoff: ${formatDate(gp.targetDate)}` : gp.estimatedPayoffLabel ? `Est. payoff: ${gp.estimatedPayoffLabel}` : 'Ongoing'}
                      {' · '}<span className="num">{formatCurrency(gp.monthlyAmount)}/mo</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="num text-ink">
                      <span className="text-accent">{formatCurrency(gp.projectedAtHorizon)}</span>
                      {gp.targetAmount !== null && <span className="text-faint"> / {formatCurrency(gp.targetAmount)}</span>}
                    </div>
                    {gp.willReachGoal !== null && (
                      <div className="mt-0.5">{gp.willReachGoal ? <Tag tone="accent">paid off by {projection.horizonEndLabel}</Tag> : <Tag tone="warn">in progress</Tag>}</div>
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

/* ── Step 4 UI: Historical Baseline & Outlier Trimming ────────── */
export function BaselineSection({ baseline, settings, onChangeSetting }) {
  const rawThreshold = settings.outlierThresholdPct;
  const numThreshold = Number(rawThreshold) || 0;

  return (
    <Section
      className="mb-10"
      title="4. Past months average & deviation filter"
      aside={
        <div className="flex flex-wrap items-center gap-4 text-xs">
          <span className="flex items-center gap-1.5" role="group" aria-label="Lookback months">
            <span className="text-faint">Months:</span>
            {[3, 6, 9, 12].map((m) => (
              <button
                key={m} type="button" onClick={() => onChangeSetting('lookbackMonths', m)}
                className={`num cursor-pointer px-1 transition-colors ${settings.lookbackMonths === m ? 'text-ink underline decoration-accent underline-offset-4' : 'text-muted hover:text-ink'}`}
              >
                {m}m
              </button>
            ))}
          </span>

          <label className="flex items-center gap-2 text-muted">
            <span className="text-faint">Accepted deviation:</span>
            <input
              type="range" min="5" max="100" step="5"
              value={Math.max(5, Math.min(100, numThreshold))}
              onChange={(e) => onChangeSetting('outlierThresholdPct', Number(e.target.value))}
              className="h-1 w-20 cursor-pointer accent-[var(--color-accent)]"
            />
            <span className="inline-flex items-center gap-0.5">
              <span className="text-faint">±</span>
              <input
                type="number" min="0" max="500" step="any"
                value={rawThreshold === '' ? '' : rawThreshold ?? 35}
                onChange={(e) => onChangeSetting('outlierThresholdPct', e.target.value === '' ? '' : Math.max(0, Number(e.target.value)))}
                onBlur={(e) => { if (e.target.value === '') onChangeSetting('outlierThresholdPct', 0); }}
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
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-rule py-3 text-xs">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
          <span>
            <span className="text-faint">Avg income: </span>
            <span className="num font-medium text-accent">{formatCurrency(baseline.trimmedAvgIncome)}</span>
            {baseline.rawAvgIncome !== baseline.trimmedAvgIncome && <span className="num text-faint"> (raw {formatCurrency(baseline.rawAvgIncome)})</span>}
          </span>
          <span>
            <span className="text-faint">Avg spend: </span>
            <span className="num font-medium text-ink">{formatCurrency(baseline.trimmedAvgExpenses)}</span>
            {baseline.rawAvgExpenses !== baseline.trimmedAvgExpenses && <span className="num text-faint"> (raw {formatCurrency(baseline.rawAvgExpenses)})</span>}
          </span>
          <span>
            <span className="text-faint">Avg saved: </span>
            <span className={`num font-medium ${baseline.trimmedAvgNet >= 0 ? 'text-accent' : 'text-debit'}`}>{signedCurrency(baseline.trimmedAvgNet)}/mo</span>
          </span>
        </div>
        <div className="text-faint">
          {baseline.excludedCount > 0 ? (
            <span>Trimmed <span className="num text-warn">{baseline.excludedCount}</span> month{baseline.excludedCount !== 1 ? 's' : ''} outside ±{baseline.outlierThresholdPct}% of mean income or spend</span>
          ) : (
            <span>All months within ±{baseline.outlierThresholdPct}% of mean income &amp; spend</span>
          )}
        </div>
      </div>

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
              const statusTag = !m.hasData ? <Tag>no data</Tag>
                : m.isIncomeOutlier && m.isExpenseOutlier ? <Tag tone="warn">income &amp; spend outlier</Tag>
                : m.isIncomeOutlier ? <Tag tone="warn">income outlier</Tag>
                : m.isExpenseOutlier ? <Tag tone="warn">spend outlier</Tag>
                : <Tag tone="accent">included</Tag>;

              return (
                <tr key={m.key} className={`${rowClass} ${!m.hasData ? 'opacity-45' : ''}`}>
                  <Td className="text-ink">{m.label}</Td>
                  <Td align="right">
                    <div className={`inline-flex flex-wrap items-baseline justify-end gap-2 ${m.isIncomeOutlier ? 'opacity-55' : ''}`}>
                      <span className="num text-accent">{formatCurrency(m.income)}</span>
                      {m.hasData && (
                        <span className={`num text-xs ${m.isIncomeOutlier ? 'text-warn' : incDev > 0 ? 'text-accent' : incDev < 0 ? 'text-debit' : 'text-faint'}`}>
                          ({incDev > 0 ? '+' : ''}{incDev.toFixed(1)}%)
                        </span>
                      )}
                    </div>
                  </Td>
                  <Td align="right">
                    <div className={`inline-flex flex-wrap items-baseline justify-end gap-2 ${m.isExpenseOutlier ? 'opacity-55' : ''}`}>
                      <span className="num text-ink">{formatCurrency(m.expenses)}</span>
                      {m.hasData && (
                        <span className={`num text-xs ${m.isExpenseOutlier ? 'text-warn' : expDev > 0 ? 'text-debit' : expDev < 0 ? 'text-accent' : 'text-faint'}`}>
                          ({expDev > 0 ? '+' : ''}{expDev.toFixed(1)}%)
                        </span>
                      )}
                    </div>
                  </Td>
                  <Td align="right" className="hidden sm:table-cell">
                    {m.hasData ? <span className={`num ${m.net >= 0 ? 'text-accent' : 'text-debit'}`}>{signedCurrency(m.net)}</span> : <span className="text-xs text-faint">—</span>}
                  </Td>
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
