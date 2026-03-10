```markdown
# REQ-1: Project Foundation — TypeScript Monorepo, Prisma Schema, DB Seed, Env Config

## Overview
Scaffold the complete WhaleRadar project skeleton — directory layout, all 13 Prisma models, typed config with validation, idempotent seed data, and a startup entry point that confirms DB, bot, and HTTP server are live. This unblocks all 11 downstream requirements.

## Problem Statement
No runnable project exists. Downstream work on the bot, workers, admin panel, and integrations cannot begin until the shared foundation — schema, config, seed, and entry point — is in place.

## Solution
Deliver a production-ready skeleton (not a prototype) that compiles cleanly, connects to Postgres, seeds default data, and logs a verified startup confirmation.

---

## Directory Structure

```
whaleradar/
├── prisma/
│   ├── schema.prisma
│   └── seed.ts
├── src/
│   ├── index.ts
│   ├── bot/
│   ├── admin/
│   ├── services/
│   ├── workers/
│   ├── sources/
│   ├── db/
│   │   └── client.ts
│   ├── config/
│   │   └── index.ts
│   ├── utils/
│   └── i18n/
├── .env.example
├── package.json
├── tsconfig.json
└── nodemon.json
```

---

## Prisma Schema

Define all 13 models in `prisma/schema.prisma` with correct field types, relations, and timestamps.

### Models

**User**
- telegramId: BigInt (unique)
- username: String (optional)
- firstName: String
- languageCode: String (default "en")
- categoryId: Int (FK → Category, optional)
- freeAlertsUsed: Int (default 0)
- isSubscribed: Boolean (default false)
- subscriptionExpiresAt: DateTime (optional)
- createdAt: DateTime
- updatedAt: DateTime
- Relations: category (Category), deliveries (UserAlertDelivery[]), payments (Payment[])

**Plan**
- id: Int (autoincrement)
- name: String
- slug: String (unique)
- price: Decimal
- currency: String (default "USD")
- billingPeriod: String
- freeAlertsLimit: Int
- isActive: Boolean (default true)
- createdAt: DateTime
- updatedAt: DateTime
- Relations: categoryAccess (PlanCategoryAccess[]), payments (Payment[])

**Category**
- id: Int (autoincrement)
- slug: String (unique)
- name: String
- description: String (optional)
- sourceIdentifier: String (optional)
- sourceKey: String (optional)
- parentCategoryId: Int (FK → Category, optional, self-relation)
- isActive: Boolean (default true)
- isVisibleToUsers: Boolean (default true)
- displayOrder: Int (default 0)
- createdAt: DateTime
- updatedAt: DateTime
- Relations: parent (Category), children (Category[]), planAccess (PlanCategoryAccess[]), traders (Trader[]), users (User[])

**PlanCategoryAccess** (composite PK: planId + categoryId)
- planId: Int (FK → Plan)
- categoryId: Int (FK → Category)

**Trader**
- id: Int (autoincrement)
- walletAddress: String (unique)
- categoryId: Int (FK → Category, optional)
- alias: String (unique)
- aliasOverride: String (optional)
- roi30d: Decimal (optional)
- roiUpdatedAt: DateTime (optional)
- rank: Int (optional)
- isTracked: Boolean (default true)
- createdAt: DateTime
- updatedAt: DateTime
- Relations: category (Category), trades (Trade[]), alertGroups (AlertGroup[])

**Market**
- id: Int (autoincrement)
- externalId: String (unique)
- title: String
- canonicalUrl: String
- affiliateUrl: String (optional)
- source: String
- createdAt: DateTime
- updatedAt: DateTime
- Relations: trades (Trade[]), alertGroups (AlertGroup[])

**Trade**
- id: Int (autoincrement)
- traderId: Int (FK → Trader)
- marketId: Int (FK → Market)
- action: String
- size: Decimal
- price: Decimal
- outcome: String (optional)
- tradedAt: DateTime
- source: String
- externalId: String (unique)
- createdAt: DateTime
- Relations: trader (Trader), market (Market), alertGroup (AlertGroup)

**AlertGroup**
- id: Int (autoincrement)
- tradeId: Int (FK → Trade, unique)
- traderId: Int (FK → Trader)
- marketId: Int (FK → Market)
- context: String
- totalSize: Decimal
- avgPrice: Decimal
- tradeCount: Int (default 1)
- createdAt: DateTime
- Relations: trade (Trade), trader (Trader), market (Market), deliveries (UserAlertDelivery[])

**UserAlertDelivery**
- id: Int (autoincrement)
- userId: Int (FK → User)
- alertGroupId: Int (FK → AlertGroup)
- deliveredAt: DateTime
- Relations: user (User), alertGroup (AlertGroup)
- Constraint: @@unique([userId, alertGroupId])

**Payment**
- id: Int (autoincrement)
- userId: Int (FK → User)
- planId: Int (FK → Plan)
- amount: Decimal
- currency: String
- provider: String
- telegramPaymentChargeId: String (optional)
- providerChargeId: String (optional)
- status: String
- paidAt: DateTime (optional)
- expiresAt: DateTime (optional)
- createdAt: DateTime
- Relations: user (User), plan (Plan)

**AppSetting** (PK: key)
- key: String (unique)
- value: String
- updatedAt: DateTime

**AdminAuditLog**
- id: Int (autoincrement)
- adminUser: String
- action: String
- entity: String
- entityId: String (optional)
- before: Json (optional)
- after: Json (optional)
- createdAt: DateTime

**WorkerLog**
- id: Int (autoincrement)
- workerName: String
- status: String
- message: String (optional)
- durationMs: Int (optional)
- createdAt: DateTime

---

## Functional Requirements

### Database Client — `src/db/client.ts`
- Export a singleton `PrismaClient` instance
- Reuse the existing instance in hot-reload environments (attach to `global` in development)
- Do not instantiate multiple clients

### Config Module — `src/config/index.ts`
- Read all required variables from `process.env`
- Validate with Zod; throw a descriptive error on any missing required variable
- Export a typed config object with these fields:

| Field                 | Env Var                 | Required                    |
| --------------------- | ----------------------- | --------------------------- |
| databaseUrl           | DATABASE_URL            | Yes                         |
| telegramBotToken      | TELEGRAM_BOT_TOKEN      | Yes                         |
| telegramProviderToken | TELEGRAM_PROVIDER_TOKEN | Yes                         |
| polymarketApiBaseUrl  | POLYMARKET_API_BASE_URL | Yes                         |
| adminUsername         | ADMIN_USERNAME          | Yes                         |
| adminPassword         | ADMIN_PASSWORD          | Yes                         |
| appBaseUrl            | APP_BASE_URL            | Yes                         |
| nodeEnv               | NODE_ENV                | No (default: "development") |

### Seed Script — `prisma/seed.ts`
All upserts — running seed twice must produce identical state.

**Categories (14):**

| slug          | name          | displayOrder | isVisibleToUsers |
| ------------- | ------------- | ------------ | ---------------- |
| everything    | Everything    | 0            | false            |
| crypto        | Crypto        | 1            | true             |
| politics      | Politics      | 2            | true             |
| sports        | Sports        | 3            | true             |
| finance       | Finance       | 4            | true             |
| economy       | Economy       | 5            | true             |
| tech          | Tech          | 6            | true             |
| culture       | Culture       | 7            | true             |
| weather       | Weather       | 8            | true             |
| mentions      | Mentions      | 9            | true             |
| geopolitics   | Geopolitics   | 10           | true             |
| ai            | AI            | 11           | true             |
| business      | Business      | 12           | true             |
| entertainment | Entertainment | 13           | true             |

**Plans (2):**

| slug | name | price | billingPeriod | freeAlertsLimit          |
| ---- | ---- | ----- | ------------- | ------------------------ |
| free | Free | 0     | —             | 10                       |
| pro  | Pro  | 39    | monthly       | unlimited (0 = no limit) |

**AppSettings (6):**

| key                       | value          |
| ------------------------- | -------------- |
| minTradeSize              | 250            |
| mergeWindowMinutes        | 15             |
| trackedTradersPerCategory | 5              |
| pollingIntervalSeconds    | 30             |
| leaderboardRefreshHours   | 6              |
| affiliateCode             | (empty string) |

### Entry Point — `src/index.ts`
- Import config (validates env on startup)
- Connect Prisma client
- Initialize Telegraf bot in polling mode
- Start Express server on `PORT` (default 3000)
- Log the following on successful startup:
  - `[DB] Connected`
  - `[Bot] Polling started`
  - `[HTTP] Listening on port {PORT}`
- Contain no business logic — delegate to modules

### Package Scripts

| Script     | Command                               |
| ---------- | ------------------------------------- |
| dev        | nodemon (or ts-node-dev) src/index.ts |
| build      | tsc                                   |
| start      | node dist/index.js                    |
| db:migrate | prisma migrate dev                    |
| db:seed    | prisma db seed                        |
| db:studio  | prisma studio                         |

### TypeScript Config
- strict: true
- target: ES2020
- module: commonjs
- outDir: dist/
- rootDir: src/
- Path aliases configured (e.g., `@db`, `@config`, `@utils`)

### `.env.example`
All 8 required variables listed with inline comments describing expected format/source.

---

## Technical Requirements

- All 13 models must have explicit `@relation` annotations where foreign keys exist
- `PlanCategoryAccess` uses a composite primary key (`@@id([planId, categoryId])`)
- `UserAlertDelivery` has a composite unique constraint (`@@unique([userId, alertGroupId])`)
- Seed uses `upsert` on natural unique keys (slug for Category/Plan, key for AppSetting)
- Config validation runs before any other module initializes — startup fails fast with a clear error message if env is incomplete
- `src/bot/`, `src/workers/`, `src/admin/`, `src/services/`, `src/sources/`, `src/utils/`, `src/i18n/` directories must exist with at least a placeholder `index.ts` so downstream requirements can import from them without path errors

---

## Acceptance Criteria

- [ ] Given the repo is cloned and `.env` is populated, When `npm run dev` is executed, Then the console logs `[DB] Connected`, `[Bot] Polling started`, and `[HTTP] Listening on port 3000` without errors
- [ ] Given `npm run build` is executed, When TypeScript compiles, Then it exits with code 0 and produces output in `dist/`
- [ ] Given `npm run db:seed` is executed against an empty database, When seed completes, Then 14 Category rows, 2 Plan rows, and 6 AppSetting rows exist
- [ ] Given `npm run db:seed` is executed a second time, When seed completes, Then row counts remain identical (idempotent)
- [ ] Given a required env variable is missing from `.env`, When the app starts, Then it throws an error naming the missing variable and exits before connecting to the database
- [ ] Given `prisma/schema.prisma` is inspected, When validated with `prisma validate`, Then all 13 models pass with no errors
- [ ] Given `src/db/client.ts` is imported in two separate modules, When both modules are loaded, Then only one `PrismaClient` instance is created
- [ ] Given the project structure is inspected, When each of `src/bot/`, `src/admin/`, `src/services/`, `src/workers/`, `src/sources/`, `src/utils/`, `src/i18n/` is checked, Then each directory exists and contains at least a placeholder `index.ts`
- [ ] Given `prisma/schema.prisma` is inspected, When the `UserAlertDelivery` model is checked, Then a `@@unique([userId, alertGroupId])` constraint is present
- [ ] Given `prisma/schema.prisma` is inspected, When the `PlanCategoryAccess` model is checked, Then a composite `@@id([planId, categoryId])` is defined
```
