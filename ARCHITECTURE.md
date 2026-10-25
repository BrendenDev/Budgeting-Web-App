# Budget App — Architecture

A personal finance tracker built as a **client-heavy Next.js app** backed by MongoDB. The server is a thin REST layer — all business logic, computation, and state management happens in the browser.

---

## Contents

**Overview:** [Tech Stack](#tech-stack) · [File Structure](#file-structure) · [Design System](#design-system--ledger-after-dark) · [Data Model](#data-model) · [API Routes](#api-routes) · [Data Flow](#data-flow) · [Auth Flow](#auth-flow)

**Guide:** [Core Philosophy](#core-philosophy) · [Design Principles](#design-principles) · [System Patterns](#system-patterns) · [The Balance Problem](#the-balance-problem) · [The Date Problem](#the-date-problem) · [The Recurring Engine](#the-recurring-engine) · [Budget & Analytics Engine](#budget--analytics-engine) · [Caching Architecture](#caching-architecture) · [Scaling Strategy](#scaling-strategy) · [Anti-Patterns to Avoid](#anti-patterns-to-avoid) · [Future Implementation Guide](#future-implementation-guide)

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router) |
| Runtime | React 19 |
| Auth | NextAuth v4 (Google OAuth, stateless JWT) |
| Database | MongoDB 6 (native driver, no ORM) |
| Charts | Hand-built SVG (`components/ProjectionChart.js`), no chart library |
| Styling | Tailwind CSS v4 (tokens in `@theme`) + small in-house UI kit |
| Fonts | DM Sans / DM Mono / Fraunces via `next/font` (self-hosted) |
| Hosting | Vercel (free tier) |

---

## File Structure

```
Budget App/
├── app/                        # Pages + API routes (Next.js App Router)
│   ├── page.js                 # Overview
│   ├── budget/page.js          # Budget & analytics lab (isolated)
│   ├── accounts/page.js        # Account management
│   ├── transactions/page.js    # Transaction explorer
│   ├── recurring/page.js       # Recurring rules & occurrences
│   ├── import/page.js          # CSV import wizard
│   ├── login/page.js           # Google OAuth login
│   ├── manifest.js             # PWA web app manifest
│   ├── layout.js               # Root layout (fonts, AuthProvider, DialogProvider)
│   ├── globals.css             # Design tokens + base styles (~150 lines)
│   └── api/                    # REST endpoints (see below)
├── components/                 # Shared UI components
│   ├── ui/index.js             # UI kit: Page, Section, Button, TextButton, Input, Select,
│   │                           #   Field, Table/Th/Td, Tag, Tally/TallyItem, Empty, Skeleton, Spinner
│   ├── overview.js             # Overview pieces (TallyStrip, CategoryBreakdown, …) — markup only
│   ├── budget.js               # Budget page sections (Baseline, Buckets, Projection) — markup only
│   ├── ProjectionChart.js      # SVG balance projection chart
│   ├── AuthGuard.js            # Route protection
│   ├── Sidebar.js              # Left rail / mobile bottom bar
│   ├── Modal.js                # Generic modal
│   ├── ConfirmDialog.js        # Promise-based confirm/alert system
│   ├── CategoryPicker.js       # Searchable category combobox
│   ├── SpendingCalendar.js     # Monthly heatmap calendar
│   └── TransactionExplorer.js  # Filterable transaction list
├── lib/                        # Shared logic
│   ├── mongodb.js              # DB connection singleton
│   ├── auth.js                 # NextAuth config + requireUserId() (server)
│   ├── auth-context.js         # Auth hook (useUser) (client)
│   ├── ownership.js            # ownsAccount() check before balance writes
│   ├── date-utils.js           # Noon-UTC date normalization + resolveClientToday
│   ├── recurrence.js           # Single recurring-date engine (client + server)
│   ├── calculation-engine.js   # Core financial math (client-side)
│   ├── budget-engine/          # Modular budget analytics math (client-side)
│   │   ├── baseline.js         # Completed-month average & outlier trimming
│   │   ├── buckets.js          # Spending caps, recurring toggles, savings/item goals
│   │   ├── projection.js       # End-of-horizon savings simulator
│   │   └── index.js            # Barrel export
│   ├── data-cache.js           # In-memory fetch cache + deduplication
│   └── use-cached-fetch.js     # React hook wrapping cached fetches
└── models/
    └── schemas.js              # Validation + document factories
```

---

## Design System — "Ledger, after dark"

Dark UI with ledger structure: ruled sections instead of cards, right-aligned mono numbers, quiet text actions. No gradients, glows or emoji.

- **Tokens** live in `app/globals.css` `@theme` and become Tailwind utilities:
  `bg` `surface` `surface-2` `rule` `rule-strong` (backgrounds/lines), `ink` `muted` `faint` (text),
  `accent` (sage: income, primary, active), `debit` (clay: expenses, destructive), `warn` (ochre).
  Use e.g. `bg-surface`, `text-muted`, `border-rule`. Don't hard-code hex colours.
- **Fonts:** `font-sans` (DM Sans, body), `num` utility (DM Mono + tabular figures, for all money), `font-title` (Fraunces, soft — section titles only).
- **Ledger utilities:** `rule-double` (double top rule that opens a section), `cal-shade` (calendar intensity via `--spend-intensity`).
- **Build new screens from `components/ui`** — `Page` (shell + title), `Section` (ruled block), `Table`/`Th`/`Td` + `rowClass`, `Button` (primary/secondary/danger), `TextButton` (`edit`/`delete`-style actions), `Field` + `Input`/`Select`.
- Hover/focus are CSS only (no JS hover handlers). Inline `style` is reserved for data-driven values (bar widths, chart sizes).
- Pages keep all data logic (fetches, handlers, memos) at the top; markup components only receive computed values.

---

## Data Model

Five MongoDB collections, all scoped by `userId`:

```
accounts              transactions            rules                 rule_occurrences      budgets
─────────             ──────────────          ─────                 ─────────────────     ───────
_id                   _id                     _id                   _id                   _id
userId                userId                  userId                ruleId                userId (1 doc/user)
name                  accountId → accounts    name                  userId                settings {}
type                  amount                  amount                lastProcessedDate     buckets[]
balance (mutable)     description             category              processedDates[]      createdAt
initialBalance        category                frequency                                   updatedAt
institution           date (noon UTC)         startDate
createdAt             type                    endDate?
updatedAt             isRecurring             accountId → accounts
                      ruleId → rules?         type
                      notes                   isActive
                      createdAt               createdAt
                      updatedAt               updatedAt
```

**Key invariant**: `account.balance = account.initialBalance + sum(all transactions for account)`

**Strict isolation**: The `budgets` collection stores user-defined budget settings and buckets (one document per user) and has zero foreign-key coupling or side effects on `accounts`, `transactions`, or `rules`.

---

## API Routes

| Endpoint | Methods | Purpose |
|---|---|---|
| `/api/accounts` | GET, POST | List / create accounts |
| `/api/accounts/[id]` | GET, PUT, DELETE | Read / update / delete account |
| `/api/accounts/[id]/recalculate` | POST | Recompute balance from source of truth |
| `/api/auth/[...nextauth]` | GET, POST | Google OAuth handler |
| `/api/budget` | GET, PUT | Read / save user budget configuration & buckets |
| `/api/transactions` | GET, POST | List (filtered, paginated) / create transactions |
| `/api/transactions/[id]` | GET, PUT, DELETE | Read / update / delete transaction |
| `/api/transactions/import` | POST | Bulk CSV import |
| `/api/recurring` | GET, POST | List / create recurring rules |
| `/api/recurring/[id]` | GET, PUT, DELETE | Read / update / delete rule (with tx rollback) |
| `/api/recurring/[id]/occurrences` | GET, POST | View occurrence audit / reinstate missing |
| `/api/recurring/[id]/undo` | POST | Reverse all transactions for a rule |
| `/api/recurring/process` | POST | Materialize missed recurring transactions |

---

## Data Flow

```
MongoDB ──── API Routes ──── Client Cache ──── React Pages
              (thin REST)    (in-memory,       (all computation
                              TTL-based,        happens here)
                              deduped)
```

1. **On page load**: `useCachedFetch` checks in-memory cache → if stale, fetches from API → stores in cache → returns to component
2. **On mutation**: Component calls API → invalidates relevant cache keys → triggers refresh
3. **On tab focus**: Cache auto-invalidates after 5s hidden → all data refetches silently
4. **On Overview mount**: `POST /api/recurring/process` materializes any overdue recurring transactions before data loads

---

## Auth Flow

```
Login Page → Google OAuth → NextAuth JWT → useUser() hook → AuthGuard
```

- Stateless JWT (no DB sessions)
- **Every API route calls `requireUserId()`** (`lib/auth.js`), which decodes the session cookie locally (no DB/network cost). Any `userId` sent by the client is ignored.
- Every query/update is filtered by that `userId`; any write that touches an account balance first checks `ownsAccount()`
- No `middleware.js` on purpose — it would run on every request and burn Vercel free-tier invocations
- Every page wraps content in `<AuthGuard>` which redirects to `/login` if unauthenticated (UX only — security is enforced server-side)

---

## Core Philosophy

This app is designed around three non-negotiable principles:

### 1. Client-Side First

The browser does all the thinking. The server is a dumb document store — it accepts JSON, stores it in MongoDB, and returns it. No server-side aggregation, no computed views, no background workers.

**Why**: Portability. The app should be able to swap MongoDB for SQLite, Supabase, a REST wrapper around flat files, or anything else that can store and retrieve JSON documents. If business logic lives in the server, you're locked to that server's capabilities.

**In practice**: All financial calculations — monthly summaries, savings rates, burn rates, projections, category breakdowns — live in `lib/calculation-engine.js` and run in the browser. The API routes are pure CRUD + the recurring materialization engine.

### 2. Transactions Are the Source of Truth

The only real data is individual transactions. Everything else — account balances, monthly summaries, category totals — is derived. If derived data drifts from reality (bugs, race conditions, manual edits), you can always rebuild it from transactions.

**In practice**: Every account stores an immutable `initialBalance` (set once at creation, never modified). The running `balance` field is a performance cache maintained via `$inc`. If it drifts, the `/api/accounts/[id]/recalculate` endpoint recomputes `initialBalance + sum(transactions)` and overwrites it.

### 3. Minimal Server Footprint

The app runs on Vercel's free tier. Serverless functions have cold starts, 10-second execution limits, and limited memory. The architecture is designed to minimize what the server needs to do:

- No aggregation pipelines
- No scheduled jobs or cron
- No server-side rendering of data
- Stateless JWT auth (no DB sessions)
- Client-side caching to reduce API calls

---

## Design Principles

### Principle: One Function, One Truth

Every piece of data should have exactly one canonical way to compute it.

| Data | Source of Truth | Where It's Computed |
|---|---|---|
| Account balance | `initialBalance + sum(transactions)` | Client (display), Server (recalculate) |
| Monthly income/expenses | Filter transactions by month, sum amounts | Client (`calculateMonthlySummary`) |
| Daily burn rate | Current month expenses / days elapsed | Client (`calculateDailyBurnRate`) |
| Balance projection | Current balances + future rule occurrences | Client (`projectBalances`) |
| Recurring occurrences | Rule start date + frequency + anchor day | Shared (`generateOccurrenceDates` in `lib/recurrence.js`) — used by every recurring route and by `projectBalances` |

### Principle: Noon UTC for All Dates

Every date entering the system — whether from user input, CSV import, recurring generation, or API response — passes through `parseDateSafe()` which normalizes it to **noon UTC** (`T12:00:00.000Z`).

Noon UTC is safe because subtracting any US timezone offset (UTC-4 through UTC-10) from noon never crosses midnight. The calendar date is preserved across all formatting operations.

**The rule**: Never write `new Date("YYYY-MM-DD")` directly. Always use `parseDateSafe()`.

### Principle: Fail-Safe Balance Maintenance

Account balances are modified in 11 different code paths (transaction create, update, delete, import, recurring process, recurring undo, recurring edit, recurring delete, occurrence reinstate, occurrence delete, and direct account edit). Any one of these getting the sign or amount wrong causes silent drift.

**The safety net**: The recalculate endpoint exists specifically for this. It ignores the current `balance` entirely and recomputes from `initialBalance + sum(transactions)`. Users can trigger it manually from the Accounts page.

---

## System Patterns

### Pattern: useCachedFetch

All data fetching uses a two-layer cache:

```
Component → useCachedFetch(url, { ttl }) → data-cache.js → fetch(url)
                                              ↑
                                    in-memory Map<url, {data, timestamp}>
                                    in-flight Promise dedup
                                    tab-focus auto-invalidation
```

**TTL defaults**: Accounts & rules = 60s. Transactions = 30s.

**Mutation pattern**: After any write operation:
```javascript
invalidateCache('/api/transactions');  // Clear matching cache entries
invalidateCache('/api/accounts');
refreshTransactions();                  // Trigger re-fetch
refreshAccounts();
```

### Pattern: Recurring Materialization

Recurring rules don't generate transactions on a schedule. They materialize **lazily on Overview load**:

```
Overview mounts
  → POST /api/recurring/process
  → For each active rule:
      → Read rule_occurrences tracker (lastProcessedDate)
      → Generate dates from lastProcessedDate to today
      → Deduplicate against existing transactions
      → Insert new transactions + $inc account balances
      → Update tracker
  → Client fetches fresh data
```

This avoids background jobs entirely. The tradeoff: the first Overview load after being away may be slightly slower.

### Pattern: Rule Edit = Full Recalculation

When a recurring rule's core properties change (start date, frequency, amount, type, account), the system:

1. Finds all existing materialized transactions for this rule
2. Reverses their balance impacts (`$inc` with opposite signs)
3. Deletes all those transactions
4. Deletes the rule_occurrences tracker
5. Regenerates transactions from the updated rule's start date to today
6. Applies new balance impacts
7. Creates a new tracker

This is expensive but correct. Partial updates (e.g., adjusting only future occurrences) would be faster but create edge cases around which transactions belong to the "old" vs "new" configuration.

---

## The Balance Problem

### How Balances Work Today

```
Account created: initialBalance = $5,000, balance = $5,000

Transaction 1: expense $500  → $inc balance by -500  → balance = $4,500
Transaction 2: income $2,000 → $inc balance by +2000 → balance = $6,500
Transaction 3: expense $93   → $inc balance by -93   → balance = $6,407

Invariant: balance ($6,407) === initialBalance ($5,000) + sum(tx) ($1,407) ✓
```

### How Drift Happens

- A transaction is deleted but the `$inc` reversal fails silently
- A recurring rule edit miscalculates the reversal delta
- Two concurrent requests both `$inc` the same account
- A bug in CSV import double-counts some rows

### How Drift Is Detected & Fixed

The recalculate endpoint ignores the current `balance` entirely:

```
correctBalance = initialBalance + sum(all transactions for this account)
db.accounts.updateOne({ _id }, { $set: { balance: correctBalance } })
```

The Accounts page has:
- a `recheck` action per account, reporting "Balance verified" or the corrected amount
- a "Recheck all" header button for batch verification

### Future: Epoch Snapshots

When the transaction count grows large enough that `sum(all transactions)` is slow:

```
Monthly snapshot: { accountId, month, year, endOfMonthBalance }
Current balance = latest snapshot balance + sum(transactions since snapshot date)
```

Snapshots are computed lazily, immutable once the month ends, and always rebuildable from `initialBalance + transactions`. Not yet implemented — the foundation (`initialBalance`) is in place.

---

## The Date Problem

### Why Dates Are Hard

```javascript
new Date("2026-07-30")
// → Wed Jul 30 2026 00:00:00 GMT+0000 (UTC)
// → Tue Jul 29 2026 18:00:00 GMT-0600 (Mountain Daylight Time)
//                    ^^^^^^^
//                    WRONG DAY
```

When you create a `Date` from a `YYYY-MM-DD` string, JavaScript interprets it as midnight UTC. In US Mountain Time (UTC-6), midnight UTC is 6 PM the previous day. Every date-dependent operation — display, filtering, recurring generation, calendar heatmaps — shows the wrong day.

### The Fix: Noon UTC

```javascript
parseDateSafe("2026-07-30")
// → new Date(Date.UTC(2026, 6, 30, 12, 0, 0))
// → Thu Jul 30 2026 12:00:00 GMT+0000 (UTC)
// → Thu Jul 30 2026 06:00:00 GMT-0600 (Mountain Daylight Time)
//            ^^^^^^^
//            CORRECT DAY
```

### Where parseDateSafe Is Used

| Layer | File | What It Protects |
|---|---|---|
| Schema | `models/schemas.js` | Transaction dates, rule start/end dates |
| API | `api/transactions/route.js` | Date range query boundaries |
| API | `api/transactions/[id]/route.js` | Transaction date updates |
| API | `api/transactions/import/route.js` | CSV import dates |
| API | `api/recurring/[id]/route.js` | Rule date changes, occurrence generation |
| API | `api/recurring/process/route.js` | Recurring materialization |
| API | `api/recurring/[id]/occurrences/route.js` | Occurrence audit |
| Display | `lib/calculation-engine.js` | `formatDate()` |
| Display | `lib/date-utils.js` | `toDateStringMT()` |
| UI | `app/recurring/page.js` | Edit form date pre-fill |
| UI | `app/transactions/page.js` | Edit form date pre-fill |

---

## The Recurring Engine

### Concept Model

```
Rule (template)                    Transactions (materialized instances)
─────────────                      ──────────────────────────────────────
name: "Rent"                       description: "Rent"
amount: 500                        amount: 500
frequency: monthly                 type: expense
startDate: 2026-04-30              date: 2026-04-30, ruleId: <rule_id>
endDate: null                      date: 2026-05-30, ruleId: <rule_id>
accountId: "main"                  date: 2026-06-30, ruleId: <rule_id>
type: expense                      ...
isActive: true
```

### Anchor Day Logic

Monthly rules use an **anchor day** — the day-of-month from the rule's `startDate`. If the rule starts on the 31st:

```
January:   31st (anchor = 31, max = 31) → 31st ✓
February:  28th (anchor = 31, max = 28) → 28th (clamped)
March:     31st (anchor = 31, max = 31) → 31st ✓ (restored, not stuck at 28)
April:     30th (anchor = 31, max = 30) → 30th (clamped)
```

The anchor day is preserved across months — it doesn't "drift down" to the shortest month.

### Materialization Flow

```
POST /api/recurring/process
  │
  ├─ For each active rule:
  │   ├─ Read tracker (lastProcessedDate, processedDates[])
  │   ├─ If rule.endDate < today → skip ("Rule has ended")
  │   ├─ Generate occurrence dates: startDate → today
  │   ├─ For each date:
  │   │   ├─ Already in processedDates? → skip
  │   │   ├─ Transaction already exists for this date? → skip
  │   │   └─ Insert transaction + accumulate balance delta
  │   ├─ $inc account balance by net delta
  │   └─ Update tracker (lastProcessedDate, processedDates[])
  │
  └─ Return { totalCreated, results[] }
```

### Occurrence States

When viewing a rule's occurrences:

| State | Meaning |
|---|---|
| **Active** | Expected date has a matching transaction in DB |
| **Missing** | Expected date, no matching transaction (was deleted or never created) |
| **Orphan** | Transaction exists but date isn't in expected schedule |

Users can **reinstate** missing occurrences (re-creates the transaction) or **delete** individual active occurrences.

---

## Budget & Analytics Engine

The `/budget` page is a strictly isolated analytics and budgeting workspace. It reads raw `transactions` and `accounts` in memory, stores user budget preferences in its own `budgets` collection, and **never modifies or limits** any core transaction, account, or recurring calculation.

### Modular Architecture (`lib/budget-engine/`)

Each calculation is implemented as an independent, pure module so individual modules can be evolved or embedded on the Overview page later without coupling:

```
lib/budget-engine/
├── baseline.js    # Module 1: Completed-month average + outlier detection & trimming
├── buckets.js     # Module 2 & 3: Spending caps, recurring toggle, savings/item goals
├── projection.js  # Module 4: End-of-horizon savings simulator
└── index.js       # Barrel export
```

1. **Module 1 — Historical Baseline (`baseline.js`)**:
   - Inspects the last $N$ **completed calendar months** (`startOffset = 1`, excluding the partial current month by default and ignoring empty pre-signup months).
   - Computes raw mean expenses across active months, each month's signed deviation percentage `(expenses - rawMean) / rawMean * 100`, and flags months where `|deviationPct| > outlierThresholdPct`.
   - Recomputes `trimmedAvgIncome`, `trimmedAvgExpenses`, `trimmedAvgRecurring`, `trimmedAvgOneTime`, and `trimmedByCategory` from non-outlier months (falling back to raw averages if every month is flagged).

2. **Modules 2 & 3 — Buckets & Recurring Cost Control (`buckets.js`)**:
   - Supports three bucket types:
     - `spending_limit`: Monthly spending cap across one or more `EXPENSE_CATEGORIES`. Includes a per-bucket `includeRecurring` boolean (`false` by default) to include or exclude `tx.isRecurring === true` transactions from both current-month actuals and trimmed historical category averages.
     - `savings_goal`: Target monthly savings allocation (`targetAmount` + `monthlyContribution`).
     - `item_goal`: Specific purchase target (`targetAmount`, `monthlyContribution`, optional `savedSoFar`, and optional `targetDate` which computes required monthly contribution vs. projected completion date).
   - Clicking any `spending_limit` bucket opens the shared `TransactionExplorer` filtered to that bucket's categories and recurring setting.

3. **Module 4 — Savings Horizon Simulator (`projection.js`)**:
   - Projects net monthly cash flow and cumulative savings over `horizonMonths` under two parallel scenarios:
     - **Historical Baseline**: `(trimmedAvgIncome - trimmedAvgExpenses) * horizonMonths`
     - **Bucketed Plan**: `trimmedAvgIncome - (plannedBucketSpend + unbucketedRecurring + unbucketedCategorySpend)`
   - **Recurring safety**: When a `spending_limit` bucket sets `includeRecurring: false`, its cap only covers one-time spending in those categories. `calculateSavingsProjection` automatically adds `unbucketedRecurring` (the trimmed historical recurring spend for those categories) back into total outflows so fixed bills are never omitted from projected savings.

### Persistence Model (`/api/budget`)

- Single document per user in `budgets`: `{ userId, settings: { lookbackMonths, outlierThresholdPct, horizonMonths, includeRecurringInBaseline }, buckets: [...] }`.
- Interactive controls (lookback window, outlier threshold slider, projection horizon) update calculations immediately in React state and **only persist to MongoDB when the user clicks "Save changes"** (or when creating/editing/deleting a bucket).

---

## Caching Architecture

### Client-Side Cache (lib/data-cache.js)

```javascript
// Structure
const cache = new Map();  // url → { data, timestamp }
const inflight = new Map();  // url → Promise (dedup concurrent requests)

// Read: returns cached data if within TTL
getCached(url, ttl) → data | null

// Write: stores data with current timestamp
setCache(url, data)

// Fetch: check cache → check inflight → make request → cache result
cachedFetch(url, { ttl }) → Promise<data>

// Invalidation: clear all entries matching prefix
invalidateCache('/api/transactions')  // clears /api/transactions?userId=...&limit=500
invalidateCache()                     // clears everything

// Focus revalidation: when user returns to tab after 5+ seconds
onFocusRevalidate(callback)           // registers listener
```

### Why Not SWR or React Query?

Simplicity and portability. The cache is ~126 lines with no dependencies. It provides the three features that matter:

1. **TTL-based staleness** — don't re-fetch data that's still fresh
2. **In-flight deduplication** — multiple components mounting simultaneously share one request
3. **Focus revalidation** — data refreshes when the user comes back to the tab

For a single-user personal finance app, this is sufficient. SWR/React Query add dependency weight and configuration complexity without meaningful benefit at this scale.

---

## Scaling Strategy

### Current Bottleneck

The Overview fetches up to 500 raw transactions on every load. All metric computation (monthly summaries, burn rates, category breakdowns) happens client-side from this array. As the account grows:

- Transfer size increases (~200KB+ for 500 transactions)
- Client-side filtering and aggregation gets slower
- The 500-item cap means historical data silently vanishes

### Planned Approach: Time-Windowed Defaults

**Not yet implemented.** The planned solution preserves the client-side-first philosophy:

1. **Default to current month**: Instead of "last 500 transactions," fetch "this month's transactions" (~20-50 items). The calculation engine already accepts a month parameter — no changes needed.

2. **On-demand historical**: A month selector or "Load More" button fetches older months when the user explicitly asks. The API already supports `startDate`/`endDate` filtering.

3. **Epoch snapshots**: Monthly balance snapshots (computed from `initialBalance + transactions up to month end`) let you reconstruct current balance from `snapshot + this month's transactions` instead of `initialBalance + all transactions ever`. Not yet implemented — `initialBalance` is the foundation.

4. **Pagination for TransactionExplorer**: Cursor-based pagination (`?cursor=<lastId>&pageSize=50`) with "Load More" button. Keeps the full explorer functional without loading thousands of records.

### What We're NOT Doing

- **Server-side aggregation**: Tested and rejected. MongoDB aggregation pipelines on Vercel free tier were slower than client-side computation due to cold starts and connection overhead. Also violates the portability principle.
- **Background jobs/cron**: Vercel free tier doesn't support them. All processing is lazy (triggered by user actions or page loads).
- **Client-side databases (IndexedDB/SQLite)**: Would add complexity for marginal benefit at current scale. Revisit if the app goes offline-first.

---

## Anti-Patterns to Avoid

### ❌ Never: `new Date("YYYY-MM-DD")`
Always use `parseDateSafe()`. The raw constructor creates midnight UTC which shifts backward in US timezones.

### ❌ Never: Trust `account.balance` as Authoritative
It's a cache maintained by `$inc`. The source of truth is `initialBalance + sum(transactions)`. If something seems wrong, recalculate.

### ❌ Never: Server-Side Business Logic
Keep financial calculations in `lib/calculation-engine.js`. API routes should do CRUD + the recurring engine. If you find yourself writing `Math.` in an API route (outside of recurring materialization), move it to the calculation engine.

### ❌ Never: Unbounded Queries Without Reason
Always pass `limit` to transaction queries. Default is 100 in the API. Don't fetch "all transactions ever" unless the user explicitly asks for it.

### ❌ Never: `$inc` Without a Safety Net
Every code path that modifies account balance via `$inc` must have a corresponding recalculate path. If you add a new mutation endpoint that touches balances, make sure the recalculate endpoint would catch errors in it.

### ❌ Never: Delete `initialBalance`
This field is the anchor for all balance recovery. It's set once at account creation and never modified. If it's missing, balance recalculation is impossible.

---

## Future Implementation Guide

### Adding a New Page

1. Create `app/<pagename>/page.js` with `'use client'` directive
2. Wrap content in `<AuthGuard>` and add `<Sidebar />`
3. Use `useCachedFetch` for data loading
4. Add navigation entry in `components/Sidebar.js`

### Adding a New API Endpoint

1. Create `app/api/<route>/route.js`
2. Start every handler with `const { userId, error } = await requireUserId(); if (error) return error;` — never read `userId` from the query/body
3. Include `userId` in **every** filter, including `_id` lookups (`{ _id, userId }`); call `ownsAccount()` before any write that references an `accountId`
4. Use `getDb()` from `lib/mongodb.js`
5. For dates: use `parseDateSafe()` on all incoming date strings; for "today" on the server use `resolveClientToday(clientToday)` (servers run in UTC)
6. For balance changes: use `$inc` and document which recalculate path covers this
7. Return appropriate HTTP status codes and `Cache-Control` headers

### Adding a New Calculation

1. Add the function to `lib/calculation-engine.js`
2. Accept raw data arrays (transactions, accounts, rules) as input
3. Return computed values — no side effects, no API calls
4. Use `parseDateSafe()` for any date operations
5. Export and import in the consuming page

### Adding a New Category

1. Add to `EXPENSE_CATEGORIES` or `INCOME_CATEGORIES` in `models/schemas.js`
2. That's it — the `CategoryPicker` component and all filtering derive from these arrays

### Modifying the Recurring Engine

This is the most dangerous area of the codebase. Changes here can corrupt account balances across all users. Before modifying:

1. Understand the full materialization flow (see [The Recurring Engine](#the-recurring-engine))
2. Trace every `$inc` path and its reversal
3. Test with the recalculate endpoint after changes
4. Consider the rule edit path (undo + regenerate) — it must stay atomic

### Switching Database Providers

The app uses the native MongoDB driver (no ORM). To switch:

1. Replace `lib/mongodb.js` with a new connection module
2. Implement the same query patterns (`find`, `findOne`, `insertOne`, `updateOne`, `deleteOne`, `deleteMany`)
3. Replace `ObjectId` references with the new DB's ID type
4. `parseDateSafe` returns standard `Date` objects — ensure the new DB stores them correctly
5. The `$inc` pattern needs an equivalent (most DBs have atomic increment)

The calculation engine (`lib/calculation-engine.js`) is completely DB-agnostic — it only operates on plain JavaScript arrays and objects.
