# Entity Activation and Recurring Dates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add reversible active/inactive state to seven financial entity types, exclude inactive entities from financial activity, and render monthly income/expense days as complete period dates.

**Architecture:** PostgreSQL stores an independent `is_active` flag on each entity table. A shared backend activation service owns table allow-listing, status updates, and active guards; resource controllers expose thin endpoints and all financial consumers filter inactive rows. A shared frontend activation control and pure calendar-date helper keep the seven pages consistent.

**Tech Stack:** Node.js, Express, TypeScript, PostgreSQL, Jest, React 18, react-i18next, Tailwind CSS.

## Global Constraints

- Existing rows and newly created rows default to active.
- Inactive rows remain visible, editable, deletable, and reactivatable.
- Historical payments, collections, movements, and bank balances are never reverted.
- Inactive rows are excluded from summaries, Dashboard, calendar, projections, reports, and notifications.
- New financial actions on inactive rows return HTTP 409.
- Monthly dates use the period month/year, clamp invalid days to month end, and render `DD/MM/YYYY` without UTC conversion.
- Preserve all unrelated uncommitted Agenda changes.

---

### Task 1: Shared backend activation contract and schema

**Files:**
- Create: `backend/src/services/entityActivation.ts`
- Create: `backend/src/services/entityActivation.test.ts`
- Modify: `backend/src/config/database.ts`

**Interfaces:**
- Produces: `ActivatableEntity`, `setEntityActiveStatus(entity, id, userId, isActive, executor?)`, `requireEntityActive(entity, id, userId, executor?)`, `InactiveEntityError`.
- `setEntityActiveStatus` returns `{ id: number; isActive: boolean } | null`.
- `requireEntityActive` returns `void`, throws `InactiveEntityError` for inactive rows, and returns a not-found signal for missing/foreign rows.

- [ ] **Step 1: Write failing service tests**

Test with a deterministic injected query executor that `income` maps only to the allow-listed `income` table, `setEntityActiveStatus` converts `is_active` to `isActive`, missing rows return `null`, and `requireEntityActive` distinguishes active, inactive, and missing rows. The expected SQL fragments and returned values must be literal fixtures.

- [ ] **Step 2: Run the test and verify RED**

Run: `npm test -- --runInBand src/services/entityActivation.test.ts`

Expected: FAIL because `entityActivation.ts` does not exist.

- [ ] **Step 3: Implement the minimal shared service**

Use this fixed allow-list:

```ts
const ENTITY_TABLES = {
  accounts: 'bank_accounts',
  income: 'income',
  expenses: 'expenses',
  cards: 'credit_cards',
  loans: 'loans',
  accountsPayable: 'accounts_payable',
  accountsReceivable: 'accounts_receivable',
} as const;
```

Only table names from this constant may be interpolated. Values remain parameterized. `InactiveEntityError` carries code `ENTITY_INACTIVE`; missing ownership returns `null` rather than revealing another user's row.

- [ ] **Step 4: Add idempotent columns**

Extend every corresponding `CREATE TABLE` statement with `is_active BOOLEAN NOT NULL DEFAULT TRUE`, then add one `DO $$` migration loop using `ALTER TABLE ... ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE` for installations whose tables already exist.

- [ ] **Step 5: Run tests and backend typecheck**

Run: `npm test -- --runInBand src/services/entityActivation.test.ts`

Run: `npm run build`

Expected: PASS and exit 0.

---

### Task 2: Resource endpoints, serialization, summaries, and active guards

**Files:**
- Modify: `backend/src/controllers/accountController.ts`
- Modify: `backend/src/controllers/incomeController.ts`
- Modify: `backend/src/controllers/expenseController.ts`
- Modify: `backend/src/controllers/cardController.ts`
- Modify: `backend/src/controllers/loanController.ts`
- Modify: `backend/src/controllers/accountsPayableController.ts`
- Modify: `backend/src/controllers/accountsReceivableController.ts`
- Modify: `backend/src/controllers/accountTransferController.ts`
- Modify: `backend/src/controllers/cashAdjustmentController.ts`
- Modify: `backend/src/routes/accounts.ts`
- Modify: `backend/src/routes/income.ts`
- Modify: `backend/src/routes/expenses.ts`
- Modify: `backend/src/routes/cards.ts`
- Modify: `backend/src/routes/loans.ts`
- Modify: `backend/src/routes/accountsPayable.ts`
- Modify: `backend/src/routes/accountsReceivable.ts`
- Create: `backend/src/controllers/entityActiveStatus.ts`
- Create: `backend/src/controllers/entityActiveStatus.test.ts`

**Interfaces:**
- Consumes: Task 1 activation service.
- Produces: `createEntityActiveStatusHandler(entity)` and `PATCH /:id/active-status` on all seven resources.
- Request: `{ isActive: boolean }`; success: `{ id, isActive }`; invalid body: 400; missing/foreign row: 404.

- [ ] **Step 1: Write failing handler tests**

Exercise the real handler factory with an injected `setEntityActiveStatus` implementation and literal request/response fakes. Cover boolean success, string rejection, invalid ID, and missing row.

- [ ] **Step 2: Run the handler test and verify RED**

Run: `npm test -- --runInBand src/controllers/entityActiveStatus.test.ts`

Expected: FAIL because the handler factory is absent.

- [ ] **Step 3: Implement and register handlers**

Each route registers its entity before `/:id` catch-all routes:

```ts
router.patch('/:id/active-status', createEntityActiveStatusHandler('income'));
```

Add `is_active` to each list/detail `SELECT`, serialize it as `isActive`, and keep inactive rows in list result sets.

- [ ] **Step 4: Exclude inactive rows from module summaries**

Keep pagination counts over all filtered list rows, but add `is_active = TRUE` only to aggregate summary queries. This makes the list reactivate-friendly while KPIs represent active finances.

- [ ] **Step 5: Guard direct financial operations**

Call `requireEntityActive` before account transfers/adjustments, income receipt status, expense payment status, card payments, loan payments, accounts-payable payments, and accounts-receivable collections. Convert `InactiveEntityError` to status 409 and do not start writes before the guard succeeds. Account selectors used by those operations must reject an inactive source/destination account.

- [ ] **Step 6: Verify resource behavior**

Run: `npm test -- --runInBand src/controllers/entityActiveStatus.test.ts src/services/entityActivation.test.ts`

Run: `npm run build`

Expected: PASS and exit 0.

---

### Task 3: Exclude inactive entities from downstream financial consumers

**Files:**
- Modify: `backend/src/controllers/dashboardController.ts`
- Modify: `backend/src/controllers/cashFlowController.ts`
- Modify: `backend/src/controllers/projectionsController.ts`
- Modify: `backend/src/controllers/reportController.ts`
- Modify: `backend/src/controllers/calendarController.ts`
- Modify: `backend/src/services/calendarService.ts`
- Modify: `backend/src/services/notificationService.ts`
- Modify: `backend/src/services/accountBalance.ts`
- Modify: `backend/src/services/financialItemTimelineService.ts`
- Modify: `backend/src/controllers/budgetController.ts`
- Modify: `backend/src/controllers/financialGoalsController.ts`

**Interfaces:**
- Consumes: database `is_active` columns.
- Produces: all cross-module totals and generated future activity operate on active sources only.

- [ ] **Step 1: Inventory every SQL source query in these consumers**

For each occurrence of the seven tables, classify it as current/future financial activity or immutable history. Current/future queries receive an `is_active = TRUE` predicate using the correct alias; immutable payment/movement history remains unchanged.

- [ ] **Step 2: Apply active predicates**

Add predicates to Dashboard KPIs/health, cash flow, projections, reports, calendar generation/refresh, scheduled notifications, account balance choices, and budget/goal calculations that read current entities. Do not add a predicate to payment history tables or to deletion cleanup queries.

- [ ] **Step 3: Verify SQL compiles and existing service tests remain green**

Run: `npm test -- --runInBand`

Run: `npm run build`

Expected: all backend tests pass and TypeScript exits 0.

---

### Task 4: Period-aware complete-date helper

**Files:**
- Modify: `frontend/src/utils/dateUtils.ts`
- Create: `frontend/src/utils/dateUtils.test.ts`
- Modify: `frontend/src/pages/Income.tsx`
- Modify: `frontend/src/pages/Expenses.tsx`

**Interfaces:**
- Produces: `formatRecurringDayForPeriod(day: number, year: number, month: number): string`, where month is 1-12.
- Example outputs: `(9, 2026, 8) => '09/08/2026'`, `(9, 2026, 9) => '09/09/2026'`, `(31, 2026, 2) => '28/02/2026'`.

- [ ] **Step 1: Write failing pure helper tests**

Use literal expectations for leading zeros, month rollover, leap-year February, non-leap February, and day 31 in a 30-day month.

- [ ] **Step 2: Run the helper test and verify RED**

Run: `npm test -- --watchAll=false --runTestsByPath src/utils/dateUtils.test.ts`

Expected: FAIL because `formatRecurringDayForPeriod` is not exported.

- [ ] **Step 3: Implement the helper**

Validate/clamp with calendar arithmetic: `lastDay = new Date(year, month, 0).getDate()`, clamp day to `1..lastDay`, and assemble padded string parts directly. Do not parse through UTC.

- [ ] **Step 4: Use the selected list period in both pages**

For monthly recurrent rows, replace `#day`/`Día day` with the helper using the same `filterYear` and `filterMonth` sent to the API. Keep non-recurrent and annual dates unchanged. Update sorting to use a local calendar timestamp built from the same clamped date.

- [ ] **Step 5: Verify helper and frontend typecheck**

Run: `npm test -- --watchAll=false --runTestsByPath src/utils/dateUtils.test.ts`

Run: `npx tsc --noEmit`

Expected: PASS and exit 0.

---

### Task 5: Shared activation UI across seven modules

**Files:**
- Create: `frontend/src/components/EntityActiveToggle.tsx`
- Modify: `frontend/src/types/index.ts`
- Modify: `frontend/src/pages/Accounts.tsx`
- Modify: `frontend/src/pages/Income.tsx`
- Modify: `frontend/src/pages/Expenses.tsx`
- Modify: `frontend/src/pages/Cards.tsx`
- Modify: `frontend/src/pages/Loans.tsx`
- Modify: `frontend/src/pages/AccountsPayable.tsx`
- Modify: `frontend/src/pages/AccountsReceivable.tsx`
- Modify: `frontend/src/i18n/locales/es/common.json`
- Modify: `frontend/src/i18n/locales/en/common.json`
- Modify: `frontend/src/i18n/locales/de/common.json`
- Modify: `frontend/src/i18n/locales/es/toast.json`
- Modify: `frontend/src/i18n/locales/en/toast.json`
- Modify: `frontend/src/i18n/locales/de/toast.json`

**Interfaces:**
- `EntityActiveToggle` props: `{ isActive: boolean; busy?: boolean; onToggle(): void; entityLabel: string }`.
- Every domain type exposes required `isActive: boolean`.

- [ ] **Step 1: Add localized common contract**

Add translations for `active`, `inactive`, `enable`, `disable`, `enableEntity`, `disableEntity`, `entityEnabled`, `entityDisabled`, and activation error in Spanish, English, and German.

- [ ] **Step 2: Implement the shared accessible control**

Render a green/neutral status badge plus a button using `Power`/`PowerOff`; set localized `title`, `aria-label`, minimum 44px touch target, busy disabled state, and no module-specific API knowledge.

- [ ] **Step 3: Wire page handlers**

Each page tracks `activationBusyId`, calls its `PATCH /<resource>/:id/active-status`, shows a success/error toast, and refetches the list. Inactive rows/cards use `opacity-60`; payment/receipt/collection actions are disabled or hidden, while edit/delete/reactivate remain available.

- [ ] **Step 4: Ensure form account choices are active only**

Account selectors filter `account.isActive`, preventing inactive accounts from being offered for new transfers, payments, or collections while keeping them visible in the Accounts page.

- [ ] **Step 5: Verify frontend**

Run: `npm test -- --watchAll=false --runTestsByPath src/utils/dateUtils.test.ts`

Run: `npx tsc --noEmit`

Run: `npm run build`

Expected: tests pass and the production build exits 0 without TypeScript errors.

---

### Task 6: Final regression and change-scope verification

**Files:**
- Review only: all files modified in Tasks 1-5.

- [ ] **Step 1: Run backend verification**

Run from `backend`: `npm test -- --runInBand && npm run build`.

- [ ] **Step 2: Run frontend verification**

Run from `frontend`: `npm test -- --watchAll=false --runTestsByPath src/utils/dateUtils.test.ts && npx tsc --noEmit && npm run build`.

- [ ] **Step 3: Check patch integrity**

Run: `git diff --check`.

Run: `git status --short` and separate pre-existing Agenda paths from this feature's paths.

- [ ] **Step 4: Review requirements line by line**

Confirm all seven modules expose activation, inactive entities remain visible, all agreed consumers exclude inactive entities, historical rows are untouched, blocked actions return 409, and the monthly date examples render exactly.
