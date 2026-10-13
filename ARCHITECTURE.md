# Budget App — Architecture Overview

A personal finance tracker built as a **client-heavy Next.js app** backed by MongoDB. The server is a thin REST layer — all business logic, computation, and state management happens in the browser.

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
│   ├── accounts/page.js        # Account management
│   ├── transactions/page.js    # Transaction explorer
│   ├── recurring/page.js       # Recurring rules & occurrences
│   ├── import/page.js          # CSV import wizard
│   ├── login/page.js           # Google OAuth login
│   ├── layout.js               # Root layout (fonts, AuthProvider, DialogProvider)
│   ├── globals.css             # Design tokens + base styles (~150 lines)
│   └── api/                    # REST endpoints (see below)
├── components/                 # Shared UI components
│   ├── ui/index.js             # UI kit: Page, Section, Button, TextButton, Input, Select,
│   │                           #   Field, Table/Th/Td, Tag, Tally/TallyItem, Empty, Skeleton, Spinner
│   ├── overview.js             # Overview pieces (TallyStrip, CategoryBreakdown, …) — markup only
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
│   ├── calculation-engine.js   # All financial math (client-side)
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

Four MongoDB collections, all scoped by `userId`:

```
accounts              transactions            rules                 rule_occurrences
─────────             ──────────────          ─────                 ─────────────────
_id                   _id                     _id                   _id
userId                userId                  userId                ruleId
name                  accountId → accounts    name                  userId
type                  amount                  amount                lastProcessedDate
balance (mutable)     description             category              processedDates[]
initialBalance        category                frequency
institution           date (noon UTC)         startDate
createdAt             type                    endDate?
updatedAt             isRecurring             accountId → accounts
                      ruleId → rules?         type
                      notes                   isActive
                      createdAt               createdAt
                      updatedAt               updatedAt
```

**Key invariant**: `account.balance = account.initialBalance + sum(all transactions for account)`

---

## API Routes

| Endpoint | Methods | Purpose |
|---|---|---|
| `/api/accounts` | GET, POST | List / create accounts |
| `/api/accounts/[id]` | GET, PUT, DELETE | Read / update / delete account |
| `/api/accounts/[id]/recalculate` | POST | Recompute balance from source of truth |
| `/api/auth/[...nextauth]` | GET, POST | Google OAuth handler |
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
4. **On dashboard mount**: `POST /api/recurring/process` materializes any overdue recurring transactions before data loads

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

## Date Strategy

All dates stored as **noon UTC** (`T12:00:00Z`) to prevent timezone-induced off-by-one errors. The `parseDateSafe()` function is the single entry point for all date creation. See `lib/date-utils.js`.
