```markdown
# REQ-9: Monetization — Plan DB Model, PlanCategoryAccess, Telegram Payments Flow, Subscription Activation

## Overview
Implement the monetization layer: database models for plans and category access, Telegram Payments invoice generation, payment webhook handling, and subscription activation.

## Problem Statement
The bot has free and paid tiers but no underlying data model, payment flow, or subscription lifecycle. REQ-3's `/subscribe` command and REQ-8's quota enforcement both depend on this layer.

## Solution
Create `Plan`, `PlanCategoryAccess`, `Payment`, and `UserSubscription` entities; expose a payment service that REQ-3 calls; handle Telegram's `pre_checkout_query` and `successful_payment` callbacks to activate subscriptions.

---

## Functional Requirements

### Payment Service Interface
- Export a `PaymentService` with a single method: `sendInvoice(ctx, userId)`
- `sendInvoice` fetches the active Pro plan from the database, constructs a Telegram invoice payload, and calls `ctx.replyWithInvoice()`
- Invoice payload fields:
  - `title`: plan name
  - `description`: plan description
  - `payload`: JSON string `{ userId, planId }`
  - `currency`: `"USD"`
  - `prices`: array with one entry — plan price in cents
  - `provider_token`: from `TELEGRAM_PAYMENT_PROVIDER_TOKEN` env var

### Pre-Checkout Query Handler
- Register `bot.on('pre_checkout_query')` on the Telegraf instance
- Parse `payload` to extract `userId` and `planId`
- Validate: plan exists and is active; user exists
- Call `ctx.answerPreCheckoutQuery(true)` on success
- Call `ctx.answerPreCheckoutQuery(false, errorMessage)` on failure
- Do NOT write any DB rows at this stage

### Successful Payment Handler
- Register handler for `successful_payment` messages on the Telegraf instance
- Parse `invoice_payload` to extract `userId` and `planId`
- Create a `Payment` row with:
  - `userId`, `planId`
  - `telegramChargeId` from `successful_payment.telegram_payment_charge_id`
  - `providerChargeId` from `provider_payment_charge_id`
  - `amount`, `currency`, `status = 'completed'`, `paidAt = now()`
- Upsert `UserSubscription` row (update if exists, insert if not):
  - `userId`, `planId`, `startDate = now()`, `endDate = now() + 30 days`, `status = 'active'`
- Send confirmation message to user with plan name, start date, and end date

### Subscription Status Check
- Export `getActiveSubscription(userId: number): Promise<UserSubscription | null>`
- Returns the `UserSubscription` row where `status = 'active'` AND `endDate > now()`
- Returns `null` if no active subscription exists
- Consumed by REQ-8's quota enforcement — no quota logic lives here

### Seed Data (idempotent — upsert on name)
- **Free plan**: `name = 'Free'`, `price = 0`, `billingPeriodDays = null`, `alertQuota = 10`, `isActive = true`
- **Pro plan**: `name = 'Pro'`, `price = 3900` (cents), `billingPeriodDays = 30`, `alertQuota = null` (unlimited), `isActive = true`
- `PlanCategoryAccess` rows: Pro plan gets access to all active categories

---

## Technical Requirements

### File Structure
- `src/bot/payments/paymentService.ts` — exports `PaymentService`
- `src/bot/payments/paymentHandlers.ts` — registers `pre_checkout_query` and `successful_payment` handlers
- `src/services/subscriptionService.ts` — exports `getActiveSubscription`
- All registered on the Telegraf bot instance in the main bot setup file

### Environment Variables
- `TELEGRAM_PAYMENT_PROVIDER_TOKEN` — required; add to Zod config validation in `src/config/index.ts`; bot startup must fail with a clear error if absent

### Error Handling
- `sendInvoice` failure: catch error, log with `userId`, send generic error message to user
- `successful_payment` handler failure after Telegram confirms payment: log error with full payload and `telegramChargeId` — do NOT re-throw (payment is already captured)
- All handlers wrapped in try/catch; errors logged with `telegramId` and handler name

---

## Data Model (add to prisma/schema.prisma, run db:migrate)

**Plan**
- `id`: Int (autoincrement)
- `name`: String
- `description`: String
- `price`: Int — in cents; 0 for free
- `billingPeriodDays`: Int? — null for free
- `alertQuota`: Int? — null means unlimited
- `isActive`: Boolean (default true)
- `createdAt`: DateTime
- `updatedAt`: DateTime
- Relations: categoryAccess (PlanCategoryAccess[]), payments (Payment[]), subscriptions (UserSubscription[])

**PlanCategoryAccess**
- `id`: Int (autoincrement)
- `planId`: Int (FK → Plan)
- `categoryId`: Int (FK → Category)
- `createdAt`: DateTime
- Constraint: `@@unique([planId, categoryId])`
- Cascade: delete when Plan or Category deleted

**Payment**
- `id`: Int (autoincrement)
- `userId`: Int (FK → User)
- `planId`: Int (FK → Plan)
- `telegramChargeId`: String (unique)
- `providerChargeId`: String
- `amount`: Int — in cents
- `currency`: String
- `status`: String — `'completed'` | `'refunded'`
- `paidAt`: DateTime
- `createdAt`: DateTime
- Cascade: delete when User deleted

**UserSubscription**
- `id`: Int (autoincrement)
- `userId`: Int (FK → User, unique — one subscription per user)
- `planId`: Int (FK → Plan)
- `startDate`: DateTime
- `endDate`: DateTime
- `status`: String — `'active'` | `'expired'` | `'cancelled'`
- `createdAt`: DateTime
- `updatedAt`: DateTime
- Cascade: delete when User deleted

---

## Integration Points

| Consumer | What It Uses |
|----------|-------------|
| REQ-3 `/subscribe` handler | `PaymentService.sendInvoice(ctx, userId)` |
| REQ-8 alert quota enforcement | `getActiveSubscription(userId)` |
| REQ-3 `/pricing` handler | `Plan` rows with `PlanCategoryAccess` |
| REQ-11 admin panel | `Plan`, `PlanCategoryAccess`, `Payment` read access |

---

## Out of Scope
- Refund handling — data model supports it; handler not in v1
- Subscription renewal reminders — not in v1
- Annual billing or additional tiers — v1 ships Free and Pro only

---

## Acceptance Criteria

- [ ] Given the Pro plan exists, When `/subscribe` calls `PaymentService.sendInvoice()`, Then a Telegram invoice is sent with correct title, price, and payload containing `userId` and `planId`
- [ ] Given a valid invoice payload, When Telegram sends `pre_checkout_query`, Then `ctx.answerPreCheckoutQuery(true)` is called and no DB rows are written
- [ ] Given an invalid `planId`, When Telegram sends `pre_checkout_query`, Then `ctx.answerPreCheckoutQuery(false, errorMessage)` is called
- [ ] Given Telegram sends `successful_payment`, When the handler processes it, Then a `Payment` row is created with `status = 'completed'`, `telegramChargeId`, `providerChargeId`, `amount`, and `paidAt`
- [ ] Given Telegram sends `successful_payment`, When the handler processes it, Then a `UserSubscription` row is created with `status = 'active'`, `startDate = now()`, and `endDate = now() + 30 days`
- [ ] Given a `UserSubscription` already exists for the user, When a new `successful_payment` is processed, Then the existing row is updated (not duplicated)
- [ ] Given payment is confirmed, When the handler completes, Then a confirmation message is sent with plan name, start date, and end date
- [ ] Given `getActiveSubscription(userId)` is called for a user with an active subscription where `endDate > now()`, Then the `UserSubscription` row is returned
- [ ] Given `getActiveSubscription(userId)` is called for a user with an expired subscription, Then `null` is returned
- [ ] Given `getActiveSubscription(userId)` is called for a user with no subscription, Then `null` is returned
- [ ] Given the seed runs, When complete, Then Free (price=0, alertQuota=10) and Pro (price=3900, billingPeriodDays=30, alertQuota=null) plans exist
- [ ] Given the seed runs, When complete, Then `PlanCategoryAccess` rows link the Pro plan to all active categories
- [ ] Given `TELEGRAM_PAYMENT_PROVIDER_TOKEN` is absent, When the bot starts, Then startup fails with a descriptive error
- [ ] Given `sendInvoice` encounters a DB error, When caught, Then a generic error message is sent to the user and the error is logged with `userId`
- [ ] Given the `successful_payment` handler encounters a DB error after Telegram confirms payment, When caught, Then the error is logged with `telegramChargeId` and no unhandled exception propagates
```
