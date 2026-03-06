# REQ-6: Trade Detection Worker — Polling Pipeline, Filtering, Merge Window, Duplicate Prevention

## Overview
Implement `src/workers/tradeWorker.ts` — the background worker that polls Polymarket every 30 seconds, filters and merges incoming trades, prevents duplicate alerts, and persists alert groups for the delivery system (REQ-8).

## Problem Statement
Without a polling worker, trades from top traders are never detected and users receive no alerts. The worker must process trades end-to-end — from leaderboard refresh through alert group creation — within 60 seconds of a trade occurring.

## Solution
A scheduled worker iterates over all active categories, fetches the current leaderboard and recent trades via the Polymarket adapter (REQ-5), applies size filtering and merge-window logic, persists new trades and alert groups, and writes a WorkerLog record each cycle.

---

## Functional Requirements

### Worker Schedule
- Run every 30 seconds via `setInterval`.
- Only one instance of the worker runs at a time — if the previous cycle has not finished, skip the new cycle and log a warning.
- Log cycle start, duration, trades processed, and alert groups created to `WorkerLog` with `workerName = "tradeWorker"`.

### Polling Pipeline (per cycle)

1. **Load active categories** — fetch all `Category` records where `isActive = true`.
2. **Fetch leaderboard** — call `polymarketSource.fetchLeaderboard(categorySlug)` for each active category.
3. **Upsert traders** — for each `NormalizedTrader`, call `findOrCreateTrader(walletAddress, categoryId, rank)` from `src/services/traderService.ts` (REQ-4). This handles alias assignment automatically.
4. **Fetch recent trades** — call `polymarketSource.fetchRecentTrades(walletAddress)` for each trader returned by the leaderboard.
5. **Filter trades** — discard any trade where `size < AppSetting.minTradeSize`.
6. **Deduplicate** — skip any trade whose `externalId` already exists in the `Trade` table.
7. **Upsert markets** — for each new trade, call `polymarketSource.fetchMarketMetadata(marketExternalId)` and upsert into the `Market` table on `externalId`.
8. **Persist trades** — insert new `Trade` records.
9. **Merge into alert groups** — apply merge-window logic (see below) to group trades before creating `AlertGroup` records.
10. **Done** — REQ-8 polls the `AlertGroup` table directly; no event emission needed from this worker.

### Merge Window Logic

- `AppSetting.mergeWindowMinutes` defines the window (default: 15 minutes).
- Two trades from the **same trader** on the **same market** within `mergeWindowMinutes` are merged into a single `AlertGroup`.
- Merge is additive: `AlertGroup.totalSize` = sum of all merged trade sizes; `AlertGroup.tradeCount` = count of merged trades.
- If no open `AlertGroup` exists for the trader+market pair within the window, create a new one.
- An `AlertGroup` is "open" if its `createdAt` is within `mergeWindowMinutes` of the current cycle time (inclusive).
- Trades on different markets, or from different traders, are never merged.
- **`AlertGroup.action` (dominant action)**: Use the action (`buy` or `sell`) that appears most frequently among merged trades. On a tie, use the action of the **first** trade in the group (lowest `tradedAt`). Recalculate on every merge.
- **`AlertGroup.outcome`**: Use the outcome of the **first** trade in the group (lowest `tradedAt`). Immutable after creation.
- **`AlertGroup.price`**: Use the price of the **first** trade in the group. Immutable after creation.
- **`AlertGroup.categoryId`**: Use the category being iterated in the outer loop when the trade is processed.

### Duplicate Prevention

- Before inserting a `Trade`, check `externalId` against the `Trade` table. Skip silently if already present.
- Before creating an `AlertGroup`, check whether an open group exists for the same `traderId` + `marketId` within the merge window. Extend the existing group rather than creating a new one.
- The worker must be safe to restart mid-cycle without creating duplicate trades or alert groups.

### Error Handling

| Error                                         | Behavior                                                             |
| --------------------------------------------- | -------------------------------------------------------------------- |
| `PolymarketApiError` on leaderboard fetch     | Log error, skip that category, continue with remaining categories    |
| `PolymarketApiError` on trades fetch          | Log error, skip that trader, continue with remaining traders         |
| `PolymarketApiError` on market metadata fetch | Log error, skip that trade (do not persist)                          |
| Request timeout (AbortError)                  | Same as `PolymarketApiError` — log and skip                          |
| DB write failure                              | Log error with trade `externalId`, skip that trade, continue cycle   |
| Unhandled exception in cycle                  | Log to `WorkerLog` with `status = "error"`, do not crash the process |

---

## Data Model (uses existing REQ-1 Prisma schema — no new migrations needed)

**Trade** fields used:
- `externalId`: String (unique) — from Polymarket `transactionHash`
- `traderId`: Int (FK → Trader)
- `marketId`: Int (FK → Market)
- `action`: String — `"buy"` or `"sell"`
- `outcome`: String
- `size`: Decimal — USD value
- `price`: Decimal — 0–1
- `tradedAt`: DateTime
- `source`: String — hardcode `"polymarket"`
- `alertGroupId`: Int? (FK → AlertGroup, nullable) — set when trade is merged into a group

**AlertGroup** fields used:
- `traderId`: Int (FK → Trader)
- `marketId`: Int (FK → Market)
- `tradeId`: Int (FK → Trade, unique) — the first/primary trade in the group
- `context`: String — set to `""` initially (REQ-7 fills this in later)
- `totalSize`: Decimal
- `avgPrice`: Decimal — average price across merged trades
- `tradeCount`: Int

---

## Technical Requirements

- AppSettings (`minTradeSize`, `mergeWindowMinutes`, `trackedTradersPerCategory`) read from DB at the start of each cycle — not cached between cycles.
- Import `polymarketSource` from `src/sources/polymarket.ts` — no direct HTTP calls.
- Import `findOrCreateTrader` from `src/services/traderService.ts` — no direct Prisma calls to the Trader model.
- Import Prisma client singleton from `src/db/client.ts`.
- No imports from `src/bot/`.
- Each cycle writes one `WorkerLog` record with: `workerName = "tradeWorker"`, `status` (`"success"` or `"error"`), `message` (summary or error message), `durationMs`.
- Worker is started from `src/workers/index.ts`.

---

## Integration Points

- **Upstream**: `src/sources/polymarket.ts` (REQ-5) — `fetchLeaderboard`, `fetchRecentTrades`, `fetchMarketMetadata`
- **Upstream**: `src/services/traderService.ts` (REQ-4) — `findOrCreateTrader`
- **Downstream**: REQ-8 polls `AlertGroup` table directly — no EventEmitter or queue needed
- **Downstream**: REQ-7 reads `AlertGroup` and `Trade` history to compute context labels
- **AppSettings read**: `minTradeSize`, `mergeWindowMinutes`, `trackedTradersPerCategory`
- **Tables written**: `Trader` (upsert via service), `Market` (upsert), `Trade` (insert), `AlertGroup` (insert or update), `WorkerLog` (insert)

---

## Out of Scope

- Alert message formatting — REQ-7
- Alert delivery to Telegram users — REQ-8
- ROI recalculation — REQ-12
- WebSocket or push-based trade ingestion — polling only in v1

---

## Acceptance Criteria

- [ ] Given the worker is running, When 30 seconds elapse, Then a new polling cycle starts and a `WorkerLog` record is written with `workerName = "tradeWorker"`
- [ ] Given a previous cycle is still executing, When the next 30-second tick fires, Then the new cycle is skipped and a warning is logged without starting a second concurrent cycle
- [ ] Given `AppSetting.minTradeSize = 250`, When a trade with `size = 100` is fetched, Then it is discarded and not inserted into the `Trade` table
- [ ] Given a trade with `externalId` already present in the `Trade` table, When the same trade is fetched in a subsequent cycle, Then it is skipped without error and no duplicate row is created
- [ ] Given two trades from the same trader on the same market within `mergeWindowMinutes`, When the second trade is processed, Then both trades are associated with the same `AlertGroup` and `AlertGroup.tradeCount = 2` and `AlertGroup.totalSize` equals the sum of both trade sizes
- [ ] Given two trades from the same trader on different markets, When both are processed, Then two separate `AlertGroup` records are created
- [ ] Given a trade from trader A and a trade from trader B on the same market within the merge window, When both are processed, Then two separate `AlertGroup` records are created
- [ ] Given `polymarketSource.fetchLeaderboard` throws a `PolymarketApiError` for one category, When the cycle runs, Then that category is skipped, remaining categories are processed, and the error is logged
- [ ] Given `polymarketSource.fetchMarketMetadata` throws a `PolymarketApiError` for one trade, When the cycle runs, Then that trade is not persisted and the cycle continues without crashing
- [ ] Given a new trader wallet is encountered, When the worker upserts the trader, Then `findOrCreateTrader` from traderService is called and the trader record has a non-null alias
- [ ] Given a completed cycle, When `WorkerLog` is queried, Then the record contains `workerName`, `status = "success"`, `durationMs`, and a summary message
- [ ] Given an unhandled exception occurs mid-cycle, When the exception is caught, Then `WorkerLog` is written with `status = "error"` and the worker process does not exit
- [ ] Given the worker module is imported, When its imports are inspected, Then it contains no imports from `src/bot/`
