// Barrel export for the modular Budget Analytics Engine.
// Each module is independent and read-only with respect to live ledger data.

export { getLookbackMonthKeys, calculateHistoricalBaseline } from './baseline.js';
export { filterBucketTransactions, evaluateBucket, evaluateAllBuckets } from './buckets.js';
export { calculateSavingsProjection } from './projection.js';
