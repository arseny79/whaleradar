```markdown
# Admin Panel: Categories, Plans, Settings, Traders, Audit Log, Worker Logs

## Overview
Extend the existing admin panel with seven management sections: categories (from REQ-2), plans, plan-category access matrix, global settings, traders, audit log, and worker logs.

## Problem Statement
The admin panel has no UI beyond category CRUD. Plans, settings, traders, and operational logs are inaccessible without direct database access, blocking day-to-day operations.

## Solution
Add six new route modules and template files under `src/admin/routes/` and `src/admin/templates/`, all protected by the existing Basic Auth middleware. No new auth, no new libraries.

---

## UX / UI Layout

### Shared Shell
Every admin page renders inside a shared layout: a top navigation bar with links to all seven sections (Categories, Plans, Plan Access, Settings, Traders, Audit Log, Worker Logs), followed by a full-width content region. The nav link for the current section is visually active.

### Categories (existing — REQ-2, no changes required)
Already implemented. Navigation link added to shared shell.

### Plans — `/admin/plans`
Epicenter: a table of plans. Columns: ID, Name, Price (cents), Billing Period (days), Alert Quota, Active, Actions. Actions per row: Edit. No create or delete — plans are seeded. Edit form shows price, billing period, alert quota, and isActive as editable fields; name is read-only.

### Plan-Category Access — `/admin/plan-access`
Epicenter: a matrix table. Rows = plans, columns = categories. Each cell is a checkbox indicating whether that plan has access to that category. Submitting the form replaces all `PlanCategoryAccess` rows for all plans in a single transaction.

### Settings — `/admin/settings`
Epicenter: a single form with all `AppSetting` key-value pairs rendered as labeled inputs. Keys are read-only labels; values are editable text inputs. Settings include at minimum: `minTradeSizeUsd`, `pollingIntervalSeconds`, `maxTradersPerCategory`, `alertMergeWindowMinutes`. Submit updates all values in one POST.

### Traders — `/admin/traders`
Epicenter: a paginated table of tracked traders. Columns: ID, Wallet (truncated), Alias, Source, Active, Actions. Actions per row: Toggle Active, Edit Alias. Edit Alias is a `<details>` element in the same table row — clicking the summary label expands a small `<form>` pre-filled with the current alias; submitting POSTs to `/admin/traders/:id/alias` and redirects back to the list. No JavaScript required. Pagination: 50 traders per page, page number in query string (`?page=1`).

### Audit Log — `/admin/audit-log`
Epicenter: a read-only table of recent admin actions. Columns: Timestamp, Admin User, Action, Entity, Entity ID, Before (collapsed JSON), After (collapsed JSON). Shows the 100 most recent rows, newest first. No pagination, no filters in v1.

### Worker Logs — `/admin/worker-logs`
Epicenter: a read-only table of recent `tradeWorker` run results. Columns: Timestamp, Workers Checked, Trades Found, Alerts Sent, Error (truncated). Shows the 50 most recent rows, newest first.

---

## Functional Requirements

### Plans

| Method | Path                    | Action           |
| ------ | ----------------------- | ---------------- |
| GET    | `/admin/plans`          | List all plans   |
| GET    | `/admin/plans/:id/edit` | Render edit form |
| POST   | `/admin/plans/:id`      | Update plan      |

- Editable fields: `price` (integer ≥ 0), `billingPeriodDays` (integer ≥ 1 or null), `alertQuota` (integer ≥ 1 or null for unlimited), `isActive` (checkbox)
- `name` is displayed but not editable
- Successful POST redirects to `/admin/plans`
- Validation failure re-renders form with inline errors
- Every successful POST writes one `AdminAuditLog` row: `action="update"`, `entity="Plan"`, `entityId=id`, `before` and `after` JSON snapshots

### Plan-Category Access

| Method | Path                 | Action                  |
| ------ | -------------------- | ----------------------- |
| GET    | `/admin/plan-access` | Render access matrix    |
| POST   | `/admin/plan-access` | Replace all access rows |

- GET fetches all plans and all active categories; renders matrix with checkboxes
- POST body: `access[planId][categoryId] = "on"` for checked cells
- Handler deletes all existing `PlanCategoryAccess` rows, then inserts rows for every checked cell — in a single Prisma transaction
- Successful POST redirects to `/admin/plan-access`
- Writes one `AdminAuditLog` row: `action="update"`, `entity="PlanCategoryAccess"`, `entityId=null`, `before=null`, `after={ matrix: { [planId]: categoryId[] } }`

### Settings

| Method | Path              | Action               |
| ------ | ----------------- | -------------------- |
| GET    | `/admin/settings` | Render settings form |
| POST   | `/admin/settings` | Update all settings  |

- GET fetches all `AppSetting` rows ordered by `key ASC`
- POST iterates submitted key-value pairs and calls `upsert` for each key
- Successful POST redirects to `/admin/settings`
- Validation: all values must be non-empty strings; numeric settings (`minTradeSizeUsd`, `pollingIntervalSeconds`, `maxTradersPerCategory`, `alertMergeWindowMinutes`) must parse as positive integers
- Validation failure re-renders form with inline errors
- Writes one `AdminAuditLog` row per changed key: `action="update"`, `entity="AppSetting"`, `entityId=key`, `before={ value: oldValue }`, `after={ value: newValue }`; unchanged keys produce no audit row

### Traders

| Method | Path                               | Action                |
| ------ | ---------------------------------- | --------------------- |
| GET    | `/admin/traders`                   | Paginated trader list |
| POST   | `/admin/traders/:id/toggle-active` | Toggle `isActive`     |
| POST   | `/admin/traders/:id/alias`         | Update alias          |

- GET accepts `?page=1` (1-indexed); fetches 50 traders per page ordered by `id ASC`; renders total count and page controls ("Previous" / "Next" links + "Page N of M" label)
- Wallet display: show first 6 and last 4 characters separated by `…` (e.g., `0x1234…abcd`)
- `toggle-active`: fetches current trader, flips `isActive`, saves, redirects to `/admin/traders`
- `alias` POST: accepts `alias` field (non-empty string, max 100 chars); updates the trader's alias field; redirects to `/admin/traders`
- Both mutations write one `AdminAuditLog` row with appropriate `action` (`"toggle_active"` or `"update_alias"`), `entity="Trader"`, `entityId=id`, `before` and `after` snapshots

### Audit Log

| Method | Path               | Action                       |
| ------ | ------------------ | ---------------------------- |
| GET    | `/admin/audit-log` | List 100 most recent entries |

- Read-only; no mutations
- Fetches `AdminAuditLog` rows ordered by `createdAt DESC`, limit 100
- `before` and `after` JSON rendered in `<details><summary>` elements (collapsed by default); summary label text: `"before"` and `"after"` respectively

### Worker Logs

| Method | Path                 | Action                      |
| ------ | -------------------- | --------------------------- |
| GET    | `/admin/worker-logs` | List 50 most recent entries |

- Read-only; no mutations
- Fetches `WorkerLog` rows ordered by `createdAt DESC`, limit 50
- Error column truncated to 120 characters with full text in a `title` attribute

---

## Technical Requirements

- All new route files under `src/admin/routes/`: `plans.ts`, `planAccess.ts`, `settings.ts`, `traders.ts`, `auditLog.ts`, `workerLogs.ts`
- All new template files under `src/admin/templates/`: `plans/`, `planAccess/`, `settings/`, `traders/`, `auditLog/`, `workerLogs/` — plain TypeScript functions returning HTML strings
- All routes registered on the existing Express admin router in `src/admin/index.ts`
- All routes protected by the existing Basic Auth middleware — no new auth logic
- No direct Prisma calls in route handlers; all data access through service functions
- New service functions: `planService.ts` (get, update), `settingsService.ts` (getAll, upsert), `traderAdminService.ts` (paginated list, toggle, update alias), `planAccessService.ts` (getMatrix, replaceAll)
- Shared layout extracted to `src/admin/templates/layout.ts` — `renderLayout(title: string, body: string): string`; all existing and new templates use it
- All TypeScript files compile under `strict: true` with no errors

---

## Data Model

**AppSetting** (new)
- `id`: number
- `key`: string — unique
- `value`: string
- `updatedAt`: DateTime

**Relationships**: standalone key-value store, no foreign keys.
**Data Integrity**: unique constraint on `key`. Seed with: `minTradeSizeUsd=250`, `pollingIntervalSeconds=30`, `maxTradersPerCategory=100`, `alertMergeWindowMinutes=15`.

**WorkerLog** (new)
- `id`: number
- `workerName`: string — e.g. `"tradeWorker"`
- `tradersChecked`: number
- `tradesFound`: number
- `alertsSent`: number
- `error`: string | null
- `createdAt`: DateTime

**Relationships**: standalone log table, no foreign keys.
**Data Integrity**: no uniqueness constraints; append-only.

**AdminAuditLog** (new — if not already created by REQ-2)
- `id`: number
- `adminUser`: string
- `action`: string
- `entity`: string
- `entityId`: string | null
- `before`: JSON | null
- `after`: JSON | null
- `createdAt`: DateTime

**Relationships**: standalone audit table, no foreign keys.

---

## Integration Points

| Consumer             | What It Uses                                                                                 |
| -------------------- | -------------------------------------------------------------------------------------------- |
| REQ-6 trade worker   | Reads `minTradeSizeUsd`, `pollingIntervalSeconds`, `maxTradersPerCategory` from `AppSetting` |
| REQ-6 trade worker   | Writes `WorkerLog` rows after each run                                                       |
| REQ-8 alert delivery | Reads `alertMergeWindowMinutes` from `AppSetting`                                            |
| REQ-9 monetization   | `Plan` and `PlanCategoryAccess` rows read/written here                                       |
| REQ-2 categories     | `AdminAuditLog` shared table; shared layout shell                                            |
| REQ-4 trader aliases | `Trader.alias` field updated via trader admin routes                                         |

---

## Out of Scope
- Admin user provisioning or multi-admin accounts — single credential pair from env only
- Audit log filtering, search, or export — read-only list in v1
- Worker log filtering by worker name — only `tradeWorker` logs shown in v1
- Plan creation or deletion — plans are seeded; only editable in v1
- Settings key creation or deletion — keys are seeded; only values are editable

---

## Acceptance Criteria

- [ ] Given valid admin credentials, When `GET /admin/plans` is requested, Then all plan rows are rendered in a table with ID, Name, Price, Billing Period, Alert Quota, Active, and Edit action
- [ ] Given valid admin credentials, When `POST /admin/plans/:id` is submitted with a new price, Then the Plan row is updated, one AdminAuditLog row is written with `action="update"` and non-null `before`/`after`, and the response redirects to `/admin/plans`
- [ ] Given valid admin credentials, When `POST /admin/plans/:id` is submitted with a negative price, Then no DB write occurs and the edit form re-renders with an inline validation error
- [ ] Given valid admin credentials, When `GET /admin/plan-access` is requested, Then a matrix table renders with one row per plan and one column per active category, with checkboxes reflecting current `PlanCategoryAccess` rows
- [ ] Given valid admin credentials, When `POST /admin/plan-access` is submitted, Then all existing `PlanCategoryAccess` rows are deleted and replaced with rows matching the submitted checkboxes in a single transaction, and one AdminAuditLog row is written
- [ ] Given valid admin credentials, When `GET /admin/settings` is requested, Then all `AppSetting` rows are rendered as labeled editable inputs
- [ ] Given valid admin credentials, When `POST /admin/settings` is submitted with valid values, Then each changed key is upserted, one AdminAuditLog row is written per changed key, and the response redirects to `/admin/settings`
- [ ] Given valid admin credentials, When `POST /admin/settings` is submitted with a non-numeric value for `pollingIntervalSeconds`, Then no DB write occurs and the form re-renders with an inline error
- [ ] Given valid admin credentials, When `GET /admin/traders?page=1` is requested, Then up to 50 trader rows are rendered with wallet (truncated), alias, source, active status, and actions
- [ ] Given valid admin credentials, When `POST /admin/traders/:id/toggle-active` is called, Then the trader's `isActive` is flipped, one AdminAuditLog row is written with `action="toggle_active"`, and the response redirects to `/admin/traders`
- [ ] Given valid admin credentials, When `POST /admin/traders/:id/alias` is submitted with a non-empty alias, Then the trader's alias is updated, one AdminAuditLog row is written with `action="update_alias"`, and the response redirects to `/admin/traders`
- [ ] Given valid admin credentials, When `POST /admin/traders/:id/alias` is submitted with an empty alias, Then no DB write occurs and the trader list re-renders with an inline error
- [ ] Given valid admin credentials, When `GET /admin/audit-log` is requested, Then up to 100 AdminAuditLog rows are rendered newest-first with `before`/`after` JSON in collapsed `<details>` elements
- [ ] Given valid admin credentials, When `GET /admin/worker-logs` is requested, Then up to 50 WorkerLog rows are rendered newest-first with error text truncated to 120 characters
- [ ] Given no admin credentials, When any admin route is requested, Then the response is 401 with a `WWW-Authenticate: Basic` header
- [ ] Given the TypeScript compiler runs with `strict: true`, When all new admin files are compiled, Then compilation exits with code 0 and no type errors
- [ ] Given any admin page is rendered, When the shared layout is applied, Then a navigation bar with links to all seven sections is present and the current section link is visually active
```
