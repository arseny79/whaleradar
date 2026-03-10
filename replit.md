# WhaleRadar

Telegram bot for tracking prediction market whale trades on Polymarket.

## Architecture

- **Runtime**: Node.js 20 + TypeScript (tsx for dev, tsc for build)
- **Database**: PostgreSQL via Prisma ORM (v5)
- **Bot**: Telegraf (Telegram Bot API)
- **HTTP**: Express with admin panel
- **Validation**: Zod for environment config validation

## Project Structure

```
whaleradar/
├── prisma/
│   ├── schema.prisma      # 14 Prisma models (includes UserCategoryPreference)
│   ├── seed.ts            # Idempotent seed (14 categories, 2 plans, 6 settings)
│   └── migrations/
├── src/
│   ├── index.ts           # Entry point (DB + Bot + Express + admin mount)
│   ├── config/index.ts    # Zod-validated env config
│   ├── db/client.ts       # Singleton PrismaClient
│   ├── services/
│   │   ├── categoryService.ts  # 9 pure data-access functions
│   │   ├── auditService.ts     # Admin audit log writer
│   │   └── paymentService.ts   # Payment stub (REQ-9)
│   ├── bot/
│   │   ├── index.ts             # registerBot() — wires all commands + callbacks
│   │   ├── keyboards/categoryKeyboard.ts  # Paginated inline keyboard
│   │   ├── commands/
│   │   │   ├── start.ts         # /start — onboarding flow
│   │   │   ├── help.ts          # /help — command list
│   │   │   ├── pricing.ts       # /pricing — plan comparison
│   │   │   ├── subscribe.ts     # /subscribe — Pro payment flow
│   │   │   ├── categories.ts    # /categories — interactive toggle selection
│   │   │   └── language.ts      # /language — language switcher
│   │   └── utils/
│   │       ├── upsertUser.ts    # Create/update User from ctx.from
│   │       └── languageDetect.ts # Map language_code to en/ru/lv
│   ├── i18n/index.ts        # t() translation with en/ru/lv strings
│   ├── admin/
│   │   ├── routes/categories.ts           # 8 CRUD routes with Basic Auth
│   │   └── templates/categories/          # HTML template literal functions
│   ├── workers/           # Background workers (placeholder)
│   ├── sources/           # Data source integrations (placeholder)
│   └── utils/             # Shared utilities (placeholder)
├── docs/                  # Requirements docs (REQ-1, REQ-2)
├── package.json
├── tsconfig.json
└── nodemon.json
```

## Key Configuration

- **Port**: 3000 default (overridden to 5000 via PORT env var for Replit)
- **Database**: PostgreSQL via DATABASE_URL env var
- **Required env vars**: DATABASE_URL, TELEGRAM_BOT_TOKEN, TELEGRAM_PROVIDER_TOKEN, POLYMARKET_API_BASE_URL, ADMIN_USERNAME, ADMIN_PASSWORD, APP_BASE_URL

## Scripts

- `npm run dev` — Development server with nodemon
- `npm run build` — TypeScript compilation (`tsc`)
- `npm start` — Production entry (`node dist/index.js`)
- `npm run db:migrate` — Prisma migrate dev
- `npm run db:seed` — Seed database
- `npm run db:studio` — Prisma Studio

## Admin Panel

- URL: `/admin/categories`
- Auth: HTTP Basic Auth (ADMIN_USERNAME / ADMIN_PASSWORD)
- Features: Category CRUD, toggle active/visible, drag-and-drop reorder
- All mutations write to AdminAuditLog via auditService
- Route ordering: `/categories/reorder` is declared before `/:id` to prevent param capture

## Bot Commands (REQ-3)

- All user-facing strings use `t()` from `src/i18n/index.ts` — no hardcoded strings in handlers
- Supported languages: en, ru, lv (auto-detected from Telegram client, changeable via /language)
- Callback patterns: `select_category:{slug}`, `category_page:{page}`, `categories_done`, `lang:{code}`, `subscribe_pro`
- Category selection: paginated at 7/page with Back/Next nav, toggle ✅ prefix, Done button
- UserCategoryPreference: `@@unique([userId, categoryId])` with cascade deletes on User and Category

## Polymarket Adapter (REQ-5)

- Located at `src/sources/polymarket.ts`
- `polymarketSource` named export groups: `fetchLeaderboard`, `fetchRecentTrades`, `fetchMarketMetadata`
- Native `fetch` with `AbortSignal.timeout(10000)` — no axios/got
- Data API uses `POLYMARKET_API_BASE_URL` from config; Gamma API hardcoded as `https://gamma-api.polymarket.com`
- `PolymarketApiError` extends Error with `statusCode` and `body`
- AppSettings (`minTradeSize`, `trackedTradersPerCategory`) read from DB at call time
- No imports from `src/workers/` or `src/bot/`

## Trade Worker (REQ-6)

- Located at `src/workers/tradeWorker.ts`, registered via `src/workers/index.ts`
- 30-second setInterval with `isRunning` concurrency guard
- 10-step pipeline: categories → leaderboard → findOrCreateTrader → fetchRecentTrades → filter minTradeSize → deduplicate by externalId → fetchMarketMetadata + upsert Market → insert Trade → merge into AlertGroup → WorkerLog
- AlertGroup merge window: same trader + same market + createdAt within `mergeWindowMinutes` of now
- Context JSON stores: action (most frequent, recalculated on merge), outcome, price, categoryId (immutable after creation)
- WorkerLog written every cycle with workerName="tradeWorker", status, durationMs
- AppSettings read fresh from DB each cycle (not cached)
- Uses `findOrCreateTrader` (no direct prisma.trader), `polymarketSource` (no direct HTTP)

## Context Engine & Alert Formatter (REQ-7)

- `src/services/contextEngine.ts` — `computeContextLabel(alertGroup)` returns one of 6 labels based on prior AlertGroup records (same trader+market, createdAt < current), evaluated top-to-bottom: First entry → Second buy today → Scaling position → Adding to position → Reducing position → Exiting position
- `src/services/alertFormatter.ts` — `formatAlertMessage(alertGroup, trader, market, label)` produces MarkdownV2 with escaped special chars, ROI as +/-X.X% (null omits ROI), dollar formatting with commas, price as percentage, conditional affiliate link line
- Queries only AlertGroup table (not Trade) for context; all date comparisons use UTC

## Alert Delivery (REQ-8)

- `src/services/alertDeliveryService.ts` — `deliverAlertGroup(alertGroupId)` fans out alerts to eligible users
- `src/bot/instance.ts` — singleton pattern for bot Telegram API access from services
- Eligibility: users with category preference matching alert's category OR 'everything' category, AND whose plan (free/pro) has PlanCategoryAccess
- Idempotency: checks existing UserAlertDelivery before sending
- Quota: free users limited by `free_alert_quota` AppSetting; Pro users (isSubscribed + non-expired) bypass quota
- Status tracking: `delivered`, `failed`, `quota_exceeded` with sentAt and errorMessage
- Wired into tradeWorker: called after both AlertGroup create and update (merge)

## Monetization (REQ-9)

- Plan model: `price` in cents (Int), `billingPeriodDays` (Int?), `alertQuota` (Int?, null=unlimited)
- UserSubscription model: userId, planId, status, startDate, endDate
- `src/bot/payments/paymentService.ts` — PaymentService class with sendInvoice(ctx, userId)
- `src/bot/payments/paymentHandlers.ts` — pre_checkout_query validation + successful_payment persistence
- `src/services/subscriptionService.ts` — getActiveSubscription(userId)
- Seed: Free plan (price=0, alertQuota=10), Pro plan (price=3900, billingPeriodDays=30, alertQuota=null), PlanCategoryAccess for Pro→all categories
- TELEGRAM_PAYMENT_PROVIDER_TOKEN added to Zod config

## i18n System (REQ-10)

- JSON translation files: `src/i18n/en.json`, `src/i18n/ru.json`, `src/i18n/lv.json`
- Namespaced keys: `commands.start.*`, `commands.help.*`, `commands.pricing.*`, `commands.subscribe.*`, `commands.categories.*`, `commands.language.*`, `alerts.*`, `payments.*`, `error.*`
- Placeholder syntax: `{{placeholder}}` (e.g. `{{firstName}}`, `{{count}}`, `{{date}}`)
- `src/i18n/index.ts`: `SupportedLang` type, `t(key, lang, params?)`, `invalidateLangCache(telegramId)`, `getCachedLang`/`setCachedLang`
- `src/bot/middleware/i18n.ts`: `I18nContext` extends `Context` with `ctx.t(key, params?)`, 5-min TTL cache, resolution: cache→DB→ctx.from.language_code→'en'
- Middleware registered BEFORE all command handlers in `src/bot/index.ts`
- All command files use `I18nContext` + `ctx.t()` instead of manual lang lookup
- `alertFormatter.ts`: `lang: SupportedLang` parameter added, uses `t()` for template strings
- `alertDeliveryService.ts`: passes `user.languageCode` to formatter per-user
- `invalidateLangCache()` called in `/language` handler after saving new language

## Admin Panel (REQ-11)

- `src/admin/templates/layout.ts` — shared `renderLayout(title, activeSection, body)` with 7-section nav bar
- All existing category templates updated to use `renderLayout`
- New services: `planService.ts`, `settingsService.ts`, `planAccessService.ts`, `traderAdminService.ts`
- New route files: `plans.ts`, `planAccess.ts`, `settings.ts`, `traders.ts`, `auditLog.ts`, `workerLogs.ts`
- Centralized admin router in `src/admin/index.ts` with shared `basicAuth` middleware
- WorkerLog model extended with `tradersChecked`, `tradesFound`, `alertsSent`, `error` fields
- tradeWorker reads `pollingIntervalSeconds` from AppSetting (dynamic interval update)
- tradeWorker tracks and logs `tradersChecked`/`tradesFound`/`alertsSent` per cycle
- Wallet display: `0x1234…abcd` format, alias edit via `<details>` element
- Plan-access: checkbox matrix, POST deletes+inserts in transaction
- Settings: only audit-logs keys whose value actually changed
- Seed includes REQ-11 keys: `minTradeSizeUsd`, `maxTradersPerCategory`, `alertMergeWindowMinutes`

## ROI Worker (REQ-12)

- `Trader.roiPercent Float?` field added to schema
- `src/workers/roiWorker.ts`: fetches Polymarket leaderboard (proxyWallet match), updates roiPercent, concurrency guard, WorkerLog per cycle
- `src/workers/tradeWorker.ts`: `isTracked` filter added, renamed to `start()`/`stop()` exports
- `src/services/alertDeliveryService.ts`: batched sending (25/batch), reads `telegramBatchDelayMs` from AppSetting
- `src/workers/index.ts`: starts both workers, SIGTERM/SIGINT handlers with 30s hard timeout
- Seeded: `roiWorkerIntervalSeconds=3600`, `telegramBatchDelayMs=1000`

## Completed Requirements

- REQ-1: Foundation (skeleton, models, config, seed, entry point)
- REQ-2: Category System (service, keyboard, admin routes, templates)
- REQ-3: Onboarding & Bot Commands (6 commands, i18n, user upsert, category preferences)
- REQ-4: Whale Alias System (traderService with findOrCreateTrader + resolveAlias)
- REQ-5: Polymarket Adapter (fetch leaderboard/trades/markets, normalize, error handling)
- REQ-6: Trade Detection Worker (polling pipeline, AlertGroup merge, WorkerLog)
- REQ-7: Context Engine & Alert Formatter (context labels, MarkdownV2 formatting)
- REQ-8: Alert Delivery (user fanout, quota enforcement, bot singleton, delivery tracking)
- REQ-9: Monetization (Telegram payments, subscriptions, plan-based access)
- REQ-10: i18n System (JSON dictionaries, ctx.t middleware, full string migration)
- REQ-11: Admin Panel (7-section layout, plans/settings/planAccess/traders/auditLog/workerLogs, dynamic worker config)
- REQ-12: ROI Worker (roiPercent field, leaderboard fetch, batched alert delivery, worker lifecycle)
