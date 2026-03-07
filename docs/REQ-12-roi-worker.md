## REQ-12 — `docs/REQ-12-roi-worker.md`

Save this as `docs/REQ-12-roi-worker.md` and upload to Replit:

```markdown
# ROI Worker & Performance Hardening

## Overview
Add `roiWorker` to periodically refresh `Trader.roiPercent` from Polymarket, harden the REQ-8 alert fanout to respect Telegram's 30 msg/sec rate limit, and implement graceful shutdown across all workers.

## Problem Statement
Trader ROI displayed in alerts (REQ-7) is never refreshed after initial insert. At 10k users, the REQ-8 sequential fanout will breach Telegram's rate limit and trigger 429 errors. Workers have no shutdown path, risking in-flight message loss on deploy.

## Solution
Three targeted changes: (1) a new `roiWorker` that runs on a configurable interval and upserts `Trader.roiPercent`; (2) batched fanout in `alertDeliveryService` with inter-batch delay; (3) SIGTERM/SIGINT handlers that drain in-flight work before `process.exit(0)`.

---

## Functional Requirements

### 1. ROI Worker (`src/workers/roiWorker.ts`)

- Fetch all `Trader` records where `isActive = true`.
- For each trader, call the Polymarket Data API leaderboard endpoint (`GET https://data-api.polymarket.com/v1/leaderboard?category=OVERALL&timePeriod=ALL&orderBy=PNL&limit=1000`) and look up the trader by `walletAddress`. Extract the `percentPnl` field from the matching leaderboard entry and store it as `Trader.roiPercent` (a Float representing percentage, e.g. `42.5` for 42.5%). If the trader is not found in the leaderboard response, leave `Trader.roiPercent` unchanged (do not null it out).
- Run on a configurable interval: read `AppSetting.roiWorkerIntervalSeconds` at startup (default `3600`). Store the `setInterval` handle in module scope so it can be cleared on shutdown. Execute the first cycle immediately on `start()` (do not wait for the first interval tick).
- Only one instance runs at a time — if the previous run has not finished, skip the new tick and log a warning.
- Write one `WorkerLog` record per run: `workerName = "roiWorker"`, `tradersChecked`, `status` (`"success"` | `"error"`), `cycleStartedAt`, `cycleFinishedAt`, `errorMessage` (if any).
- A fetch failure for one trader logs the error and continues to the next trader; it does not abort the run.

### 2. Trade Worker: Skip Inactive Traders

- In `src/workers/tradeWorker.ts`, after fetching the leaderboard, filter out any trader where `Trader.isActive = false` before calling `fetchRecentTrades`.
- No other changes to the tradeWorker pipeline.

### 3. Alert Fanout Batching (REQ-8 hardening)

- In `src/services/alertDeliveryService.ts`, replace the sequential per-user send loop with a batched loop:
  - Batch size: 25 messages per batch (leaves headroom below Telegram's 30 msg/sec limit).
  - Delay between batches: 1000 ms (configurable via `AppSetting.telegramBatchDelayMs`, default `1000`). The delay is inserted **between** batches only — no delay after the final batch.
  - Within each batch, sends remain sequential (no `Promise.all`) to avoid burst spikes.
- Quota checks, `UserAlertDelivery` writes, and error isolation behavior from REQ-8 are unchanged.
- Read `telegramBatchDelayMs` from `AppSetting` once per `deliverAlertGroup` call (not cached at module level).

### 4. Graceful Shutdown

- In `src/workers/index.ts`, register handlers for `SIGTERM` and `SIGINT`.
- On signal received:
  1. Clear all `setInterval` handles (tradeWorker, roiWorker) so no new cycles start.
  2. Wait for any in-progress worker cycle to complete (each worker exposes a `Promise` representing the current cycle, or `null` if idle).
  3. Call `process.exit(0)` after all cycles resolve or after a 30-second hard timeout, whichever comes first.
- Each worker module exports two items: `start(): void` and `stop(): Promise<void>`.
- `stop()` clears the interval and returns the in-progress cycle promise (or `Promise.resolve()` if idle).

---

## Technical Requirements

- **No new npm packages.** Use native `fetch`, `setInterval`, and `AbortController` only.
- **DB queries in hot paths** (fanout eligibility check, merge-window lookup, quota count) must filter on indexed columns: `UserAlertDelivery.userId`, `UserAlertDelivery.alertGroupId`, `Trade.externalId`, `Trader.walletAddress`, `Trader.isActive`.
- `roiWorker` imports `polymarketSource` from `src/sources/polymarket.ts` and the Prisma client from `src/db/client.ts`. No imports from `src/bot/`.
- `AppSetting` keys added by this requirement: `roiWorkerIntervalSeconds` (default `3600`), `telegramBatchDelayMs` (default `1000`). Both must be present in the DB seed.

---

## Data Model

**Trader** (extended)
- `roiPercent`: Float? — updated by roiWorker each cycle

**WorkerLog** (no schema changes — existing fields cover roiWorker needs)
- `workerName = "roiWorker"`, `tradersChecked`, `tradesFound = 0`, `alertsSent = 0`, `error` (nullable)

**AppSetting** (extended — new keys seeded)
- `roiWorkerIntervalSeconds`: String (value `"3600"`)
- `telegramBatchDelayMs`: String (value `"1000"`)

**Data Integrity**
- `WorkerLog.workerName` for the ROI worker must be `"roiWorker"` (consistent with `"tradeWorker"` convention).
- `Trader.roiPercent` may be null if the worker has never run or the trader was not found in the leaderboard response.

---

## Integration Points

| Direction | Requirement                   | Detail                                                                       |
| --------- | ----------------------------- | ---------------------------------------------------------------------------- |
| Upstream  | REQ-5 Polymarket adapter      | `roiWorker` calls Polymarket Data API directly (same base URL)               |
| Upstream  | REQ-6 tradeWorker             | Adds `isActive` filter before `fetchRecentTrades`                            |
| Upstream  | REQ-8 alert delivery          | Replaces sequential loop with batched loop                                   |
| Upstream  | REQ-11 WorkerLog / AppSetting | Reads `roiWorkerIntervalSeconds`, `telegramBatchDelayMs`; writes `WorkerLog` |
| Writes    | This requirement              | `Trader.roiPercent` (update), `WorkerLog` (insert), `AppSetting` seed rows   |

---

## Out of Scope

- **Per-trader ROI history or time-series storage** — only the current `roiPercent` scalar is stored; historical tracking is v2.
- **Parallel batch sends within a batch** — sequential sends within each batch only; `Promise.all` fanout is v2.
- **Dead-letter queue or retry for failed Telegram sends** — failed deliveries are recorded in `UserAlertDelivery` but not retried (unchanged from REQ-8).
- **Dynamic batch size tuning** — batch size of 25 is fixed in v1; admin-configurable batch size is v2.

---

## Acceptance Criteria

- [ ] Given `AppSetting.roiWorkerIntervalSeconds = 3600`, When the application starts, Then `roiWorker` fires once immediately and then every 3600 seconds
- [ ] Given a roiWorker cycle completes, When `WorkerLog` is queried for `workerName = "roiWorker"`, Then the record contains `tradersChecked`, and `error` is null on a successful run
- [ ] Given a roiWorker cycle is in progress, When the next interval tick fires, Then the new cycle is skipped and a warning is logged without starting a second concurrent cycle
- [ ] Given `polymarketSource` throws for one trader during a roiWorker run, When the run completes, Then `Trader.roiPercent` is updated for all other traders and the run writes a WorkerLog with null error (or error only if all traders fail)
- [ ] Given a `Trader` record with `isActive = false`, When the tradeWorker cycle runs, Then `fetchRecentTrades` is not called for that trader
- [ ] Given 100 eligible users for an AlertGroup and `AppSetting.telegramBatchDelayMs = 1000`, When `deliverAlertGroup` is called, Then messages are sent in batches of 25 with a ~1000 ms delay between batches and all 100 `UserAlertDelivery` records are written
- [ ] Given `AppSetting.telegramBatchDelayMs` is updated from 1000 to 500, When the next `deliverAlertGroup` call occurs, Then the new delay value is used without restarting the service
- [ ] Given the process receives SIGTERM, When a tradeWorker cycle is in progress, Then no new cycles start, the in-progress cycle completes, and `process.exit(0)` is called
- [ ] Given the process receives SIGTERM with no cycles in progress, When the signal is handled, Then `process.exit(0)` is called within 1 second
- [ ] Given 30 seconds elapse after SIGTERM with a cycle still running, When the hard timeout fires, Then `process.exit(0)` is called regardless of cycle state
- [ ] Given `src/workers/roiWorker.ts` is inspected, When its imports are checked, Then it contains no imports from `src/bot/`
- [ ] Given the DB seed runs, When `AppSetting` is queried, Then rows exist for `roiWorkerIntervalSeconds` (value `"3600"`) and `telegramBatchDelayMs` (value `"1000"`)
```
