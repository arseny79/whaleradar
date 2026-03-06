# REQ-4: Whale Alias System — Trader Storage, Stable Alias Assignment, Admin Override

## Overview
Store tracked traders in the database and assign each a stable, human-readable alias on first encounter. Wallet addresses are never shown to users — every alert references an alias like "Crypto Trader #1".

## Problem Statement
Polymarket wallet addresses are opaque 42-character hex strings. Without a stable alias layer, alerts are unreadable and users cannot recognize repeat traders across alerts.

## Solution
When a trader is first seen, generate and persist a deterministic alias scoped to their category and rank. Admins can override any alias via the admin panel. All downstream alert formatting reads the alias, never the wallet address.

---

## Functional Requirements

### Trader Record Creation
- When a wallet address is encountered that does not exist in the `Trader` table, create a new record with:
  - `walletAddress`: the raw address (stored, never displayed)
  - `alias`: auto-generated (see Alias Generation below)
  - `categoryId`: the category from which the trader was discovered
  - `rank`: their current leaderboard rank within that category
  - `isTracked`: `true`
- If the wallet address already exists, update `rank`, `roi30d`, and `roiUpdatedAt` — do not regenerate the alias

### Alias Generation
- Format: `{Category Name} Trader #{rank}` where rank is the trader's leaderboard position within their category
  - Examples: `Crypto Trader #1`, `Politics Trader #3`, `Sports Trader #2`
- Alias is assigned once at record creation and never changed by the system
- Alias must be unique across all traders (`alias` field has a unique constraint per REQ-1 schema)
- If a collision occurs (two traders would receive the same alias), append a suffix to disambiguate: `Crypto Trader #1-B`

### Admin Alias Override
- Admins can set `aliasOverride` on any trader record via the admin panel
- When `aliasOverride` is set and non-empty, all alert formatting and display uses `aliasOverride` instead of `alias`
- Clearing `aliasOverride` (setting it to null/empty) reverts display to the system-generated `alias`
- The override is stored in the existing `aliasOverride` field on the `Trader` model (defined in REQ-1)

### Alias Resolution
- Provide a utility function `resolveAlias(trader: Trader): string` that returns `aliasOverride` if set, otherwise `alias`
- All alert formatting (REQ-7), admin display (REQ-11), and any other consumer must use this function — never read `alias` directly

### Trader Lookup
- Provide a service function `findOrCreateTrader(walletAddress, categoryId, rank)` that:
  1. Looks up the trader by `walletAddress`
  2. If found: updates `rank`, returns existing record
  3. If not found: generates alias, creates record, returns new record
- This function is the single entry point for trader persistence — the Polymarket adapter (REQ-5) and trade detection worker (REQ-6) call this function, not raw Prisma

---

## Technical Requirements

### Service Location
- Implement in `src/services/traderService.ts`
- Export: `findOrCreateTrader`, `resolveAlias`

### Data Integrity
- `walletAddress` is the natural key — all lookups use this field
- `alias` is immutable after creation (never updated by the system)
- `aliasOverride` is nullable; null and empty string both mean "no override"
- Alias generation runs inside the same transaction as record creation to prevent race conditions producing duplicate aliases

### Trader Model (from REQ-1 — no schema changes needed)

| Field         | Type      | Notes                                |
| ------------- | --------- | ------------------------------------ |
| walletAddress | String    | Unique, stored only, never displayed |
| alias         | String    | Unique, system-generated, immutable  |
| aliasOverride | String?   | Admin-set, nullable                  |
| categoryId    | Int?      | FK → Category                        |
| rank          | Int?      | Current leaderboard rank             |
| isTracked     | Boolean   | Default true                         |
| roi30d        | Decimal?  | Updated by ROI worker                |
| roiUpdatedAt  | DateTime? | Timestamp of last ROI update         |

---

## Acceptance Criteria

- [ ] Given a wallet address not in the database, When `findOrCreateTrader` is called with walletAddress, categoryId, and rank, Then a new Trader record is created with a non-null alias in the format `{Category Name} Trader #{rank}`
- [ ] Given a wallet address already in the database, When `findOrCreateTrader` is called again, Then no new record is created and the existing alias is unchanged
- [ ] Given two traders that would receive the same alias, When both are created, Then each receives a unique alias (collision resolved with suffix)
- [ ] Given a trader with no aliasOverride set, When `resolveAlias` is called, Then it returns the system-generated `alias`
- [ ] Given a trader with aliasOverride set to "Whale King", When `resolveAlias` is called, Then it returns "Whale King"
- [ ] Given a trader with aliasOverride set to null, When `resolveAlias` is called, Then it returns the system-generated `alias`
- [ ] Given the Trader table is inspected, When any trader record is examined, Then the `walletAddress` field is never surfaced in any alert message or user-facing output
- [ ] Given `findOrCreateTrader` is called concurrently for the same wallet address, When both calls complete, Then exactly one Trader record exists with one alias
- [ ] Given `src/services/traderService.ts` is imported by the Polymarket adapter and trade detection worker, When either calls `findOrCreateTrader`, Then the call succeeds without direct Prisma access to the Trader model outside the service
