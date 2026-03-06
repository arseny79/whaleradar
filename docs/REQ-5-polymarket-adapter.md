docs/REQ-5-polymarket-adapter.md

# REQ-5: Polymarket Source Adapter — Leaderboard Fetch, Trader Normalization, Market Metadata

## Overview
Implement `src/sources/polymarket.ts` — the adapter that fetches the Polymarket leaderboard and recent trades, normalizes raw API responses into internal `Trader` and `Market` shapes, and exposes a typed interface consumed by the trade detection worker (REQ-6).

## Problem Statement
The trade detection worker needs a stable, typed interface to Polymarket data. Without this adapter, every worker would need to handle raw API responses, inconsistent field names, and wallet-address-to-trader mapping directly.

## Solution
A single source adapter module encapsulates all Polymarket API communication and data normalization. The worker calls adapter methods; the adapter owns the HTTP layer, response parsing, and field mapping.

---

## API Contracts (Polymarket Public APIs)

### Base URLs
- **Data API**: `https://data-api.polymarket.com` — leaderboard and trades
- **Gamma API**: `https://gamma-api.polymarket.com` — market metadata

Both are public (no authentication required). `POLYMARKET_API_BASE_URL` in config points to the Data API base.

### Leaderboard Endpoint

GET https://data-api.polymarket.com/v1/leaderboard Query params: category string OVERALL | POLITICS | SPORTS | CRYPTO | CULTURE | MENTIONS | WEATHER | ECONOMICS | TECH | FINANCE (default: OVERALL) timePeriod string DAY | WEEK | MONTH | ALL (default: DAY) orderBy string PNL | VOL (default: PNL) limit integer 1–50 (default: 25) offset integer 0–1000

Raw response (array of `TraderLeaderboardEntry`):
```json
[
  {
    "rank": "1",
    "proxyWallet": "0x56687bf447db6ffa42ffe2204a05edaa20f55839",
    "userName": "whale123",
    "vol": 125000,
    "pnl": 42000,
    "profileImage": "https://...",
    "xUsername": "whale123",
    "verifiedBadge": true
  }
]

Field mapping → NormalizedTrader:

    proxyWallet → walletAddress
    rank (string) → rank (number, parse with parseInt)
    pnl / vol → derive roi30d as pnl / vol (approximation; set to 0 if vol is 0)
    categorySlug → passed through from caller

Trades Endpoint

GET https://data-api.polymarket.com/trades
Query params:
  user         string  wallet address (required)
  takerOnly    boolean default: true
  filterType   string  CASH (required when filterAmount set)
  filterAmount number  minimum trade size in USD
  after        string  Unix timestamp (seconds) — filter trades after this time
  limit        integer 0–10000 (default: 100)

Raw response (array of Trade):

[
  {
    "proxyWallet": "0x56687bf447db6ffa42ffe2204a05edaa20f55839",
    "side": "BUY",
    "conditionId": "0xdd22472e552920b8438158ea7238bfadfa4f736aa4cee91a6b86c39ead110917",
    "size": 500,
    "price": 0.65,
    "timestamp": 1700000000,
    "title": "Will X happen?",
    "slug": "will-x-happen",
    "outcome": "Yes",
    "transactionHash": "0xabc..."
  }
]

Field mapping → NormalizedTrade:

    transactionHash → externalId (unique trade identifier)
    proxyWallet → walletAddress
    conditionId → marketExternalId
    side (uppercase) → action (lowercase: "buy" or "sell")
    outcome → outcome
    size → size
    price → price
    timestamp (Unix seconds) → tradedAt (multiply by 1000 for new Date(timestamp * 1000))

Implementation notes:

    Pass after = Unix timestamp of 24 hours ago to filter server-side
    Pass filterType=CASH&filterAmount={minTradeSize} to filter by size server-side
    takerOnly=true (default) — only fetch taker-side trades
    Filter out any entries missing transactionHash (cannot form a unique externalId)

Market Metadata Endpoint

GET https://gamma-api.polymarket.com/markets?condition_ids={conditionId}

Raw response (array, take first element):

[
  {
    "conditionId": "0xdd22...",
    "question": "Will X happen?",
    "slug": "will-x-happen",
    "url": "https://polymarket.com/event/will-x-happen"
  }
]

Field mapping → NormalizedMarket:

    conditionId → externalId
    question → title
    url → canonicalUrl (if absent, construct as https://polymarket.com/event/{slug})
    source → hardcoded "polymarket"

Category-to-API Mapping

Category.sourceIdentifier = the Polymarket category enum value to pass to the leaderboard API. Category.sourceKey = not used by the leaderboard endpoint; reserved for future use. The adapter should read it but not pass it to any API call in v1.

everything category special case:

    sourceIdentifier = "OVERALL" (set in seed data)
    The adapter passes category=OVERALL to the leaderboard — this is NOT a null/skip case
    Only categories with sourceIdentifier = null are skipped with a warning

Category enum mapping (sourceIdentifier values):
Category slug	sourceIdentifier
everything	OVERALL
crypto	CRYPTO
politics	POLITICS
sports	SPORTS
finance	FINANCE
economy	ECONOMICS
tech	TECH
culture	CULTURE
weather	WEATHER
mentions	MENTIONS
geopolitics	null (skip)
ai	null (skip)
business	null (skip)
entertainment	null (skip)
HTTP Client & Error Handling

    Use node-fetch (v3, already available in Node 18+) or the native fetch global — do NOT add axios or got as a new dependency unless already in package.json
    Set signal: AbortSignal.timeout(10000) for the 10-second timeout
    On timeout: the AbortError propagates as-is — do NOT wrap in PolymarketApiError
    On non-2xx: throw PolymarketApiError with statusCode and body
    trackedTradersPerCategory is passed as the limit query param to the leaderboard API (server-side limit)
    The 24-hour window is implemented via the after query param (server-side filter)

Adapter Interface — src/sources/polymarket.ts

Export three functions:
Function	Purpose
fetchLeaderboard(categorySlug: string): Promise<NormalizedTrader[]>	Fetch top traders for a category from the Polymarket leaderboard API
fetchRecentTrades(walletAddress: string): Promise<NormalizedTrade[]>	Fetch recent trades for a single wallet address
fetchMarketMetadata(externalId: string): Promise<NormalizedMarket>	Fetch market title, canonical URL, and source metadata for a given market ID

fetchLeaderboard internal DB lookup pattern:

    The function receives categorySlug and internally looks up the Category record from the DB to read sourceIdentifier
    If sourceIdentifier is null: log [polymarket] Skipping leaderboard for category {slug}: no sourceIdentifier and return []
    If sourceIdentifier is non-null: pass it as the category query param to the leaderboard API
    Fixed query params (always use these values): timePeriod=ALL, orderBy=PNL
    limit = value of AppSetting.trackedTradersPerCategory (read from DB at call time)

fetchMarketMetadata empty result handling:

    If the Gamma API returns an empty array for the given conditionId, throw a PolymarketApiError with statusCode: 404 and body: 'Market not found: {externalId}'

Gamma API base URL:

    Hardcode https://gamma-api.polymarket.com inside the adapter — it is NOT read from config
    POLYMARKET_API_BASE_URL from config is used only for the Data API (leaderboard + trades endpoints)

NormalizedTrader Shape
Field	Type	Source
walletAddress	string	Polymarket wallet field
rank	number	Position in leaderboard response
roi30d	number	30-day ROI as decimal (e.g. 0.42 = 42%)
categorySlug	string	Passed through from caller
NormalizedTrade Shape
Field	Type	Source
externalId	string	Unique trade identifier from Polymarket
walletAddress	string	Trader wallet
marketExternalId	string	Market identifier
action	string	"buy" or "sell"
outcome	string	Outcome label (e.g. "Yes", "No")
size	number	USD size of the trade
price	number	Price per share (0–1)
tradedAt	Date	Trade timestamp
NormalizedMarket Shape
Field	Type	Source
externalId	string	Polymarket market ID
title	string	Human-readable market question
canonicalUrl	string	Direct link to the market
source	string	Always "polymarket"
Technical Requirements

    The adapter must not import from src/workers/ or src/bot/ — it is a pure data-access layer.
    All exported functions must be independently testable with a mocked HTTP client.
    PolymarketApiError must extend Error and include statusCode: number and body: string.
    The adapter reads AppSetting values via the shared Prisma client singleton from src/db/client.ts.
    Field name mapping must be isolated in a single normalize* helper per entity so changes to the Polymarket API require edits in one place only.
    The module must export a named polymarketSource object grouping the three functions, in addition to the individual named exports.

Integration Points

    Upstream: src/db/client.ts (Prisma singleton), src/config/index.ts (base URL)
    Downstream: Trade detection worker (REQ-6) calls fetchLeaderboard and fetchRecentTrades; ROI worker (REQ-12) calls fetchLeaderboard
    AppSettings read: minTradeSize, trackedTradersPerCategory
    Category fields used: sourceIdentifier, sourceKey

Out of Scope

    WebSocket or streaming trade feeds — polling only in v1
    Authentication or API key support for Polymarket — public endpoints only
    Adapters for any market source other than Polymarket
    Caching or deduplication of API responses — handled by the worker layer

Acceptance Criteria

    Given a valid category slug with a non-null sourceIdentifier, When fetchLeaderboard is called, Then the adapter looks up the category in the DB, passes sourceIdentifier as the category param with timePeriod=ALL&orderBy=PNL, and returns an array of NormalizedTrader objects sorted by rank ascending with no entries missing walletAddress
    Given AppSetting.trackedTradersPerCategory is set to 5, When fetchLeaderboard is called, Then it returns at most 5 traders
    Given a wallet address, When fetchRecentTrades is called, Then it returns only trades where size >= AppSetting.minTradeSize and tradedAt is within the last 24 hours
    Given a market external ID, When fetchMarketMetadata is called, Then it returns a NormalizedMarket with non-empty title, canonicalUrl, and source === "polymarket"
    Given a category with sourceIdentifier null, When fetchLeaderboard is called, Then it skips the API call, logs a warning, and returns an empty array without throwing
    Given the Polymarket API returns a non-2xx status, When any adapter function is called, Then it throws a PolymarketApiError with the correct statusCode and body
    Given the Polymarket API does not respond within 10 seconds, When any adapter function is called, Then the request times out and throws an error
    Given src/sources/polymarket.ts is imported, When the module is inspected, Then it exports fetchLeaderboard, fetchRecentTrades, fetchMarketMetadata, and polymarketSource as named exports
    Given the adapter is imported, When it is checked for imports, Then it contains no imports from src/workers/ or src/bot/
    Given field names change in the Polymarket API response, When the normalize helpers are updated, Then no changes are needed outside the respective normalize* function
