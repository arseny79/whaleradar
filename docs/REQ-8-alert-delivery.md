```markdown
# REQ-8: Alert Delivery System — User Eligibility, Free Quota Enforcement, Alert Group Fanout

## Overview
Deliver formatted alert messages to eligible Telegram users for each new `AlertGroup`, enforcing the free-tier quota and skipping users whose category access or subscription status excludes them.

## Problem Statement
Without a delivery layer, formatted alerts produced by REQ-7 never reach users. The system must determine which users should receive each alert, respect the 10-alert free quota, and record every delivery attempt.

## Solution
For each new `AlertGroup`, query eligible users based on category subscription and plan access, check per-user quota, send the formatted message via the Telegram Bot API, and write a `UserAlertDelivery` record for every attempt.

---

## Functional Requirements

### Eligibility Check
A user is eligible to receive an alert for a given `AlertGroup` when ALL of the following are true:
- The user has subscribed to the category matching `AlertGroup.market.categoryId` (or has subscribed to the "Everything" category — identified by `Category.slug = 'everything'`)
- The user's plan grants access to that category (via `PlanCategoryAccess`)
- The user's `isActive` flag is `true`

**Pro user determination**: A user is on a Pro plan when `user.isSubscribed = true` AND `user.subscriptionExpiresAt` is either null or in the future. Free-tier users have `isSubscribed = false`.

**Duplicate delivery protection**: Before writing any `UserAlertDelivery` record, check whether a record already exists for `(userId, alertGroupId)`. If one exists, skip that user entirely (no send, no write). This makes `deliverAlertGroup` idempotent — safe to call multiple times for the same group.

**Non-existent alertGroupId**: If the `AlertGroup` record is not found, log a warning and return immediately without processing any users.

### Free Quota Enforcement
- Free-tier users have a lifetime quota of 10 delivered alerts (configurable via `AppSetting` key `free_alert_quota`; default `10`)
- Count delivered alerts by querying `UserAlertDelivery` records where `userId` matches and `status = "delivered"`
- If the count equals or exceeds the quota, skip delivery and write a `UserAlertDelivery` record with `status = "quota_exceeded"`
- Pro users bypass quota enforcement entirely

### Fanout Execution
- Fetch the full `Trader` and `Market` records using `alertGroup.traderId` and `alertGroup.marketId` **before** the fanout loop (do not re-fetch per user)
- For each eligible user, in order:
  1. Call `computeContextLabel(alertGroup)` (REQ-7)
  2. Call `formatAlertMessage(alertGroup, trader, market, label)` (REQ-7)
  3. Send the message via `bot.sendMessage(user.telegramId, message, { parse_mode: 'MarkdownV2' })`
  4. Write a `UserAlertDelivery` record with `status = "delivered"` and `sentAt = now()`
- If `sendMessage` throws, write a `UserAlertDelivery` record with `status = "failed"` and store the error message in `errorMessage`; continue to the next user
- Fanout is sequential per `AlertGroup`; no parallel sends

### Delivery Entry Point
- Export a function `deliverAlertGroup(alertGroupId: number): Promise<void>` from `src/services/alertDeliveryService.ts`
- REQ-6 trade worker calls this after persisting each new `AlertGroup`

---

## Technical Requirements

- Implement in `src/services/alertDeliveryService.ts`
- Export only: `deliverAlertGroup`
- Import Prisma client from `src/db/client.ts`
- Import `computeContextLabel`, `formatAlertMessage` from REQ-7 modules
- Import the Telegraf bot instance from `src/bot/index.ts`
- Read `free_alert_quota` from `AppSetting` at delivery time (not cached)
- Failed sends for one user must not abort delivery to remaining users
- Log errors with `userId` and `alertGroupId` context

---

## Data Model — UserAlertDelivery (new table)

| Field          | Type      | Notes                                              |
| -------------- | --------- | -------------------------------------------------- |
| id             | Int       | Auto-increment PK                                  |
| userId         | Int       | FK → User                                          |
| alertGroupId   | Int       | FK → AlertGroup                                    |
| status         | String    | `"delivered"` \| `"failed"` \| `"quota_exceeded"` |
| sentAt         | DateTime? | Set when status is `delivered`                     |
| errorMessage   | String?   | Set when status is `failed`                        |
| createdAt      | DateTime  | Default now                                        |

- Unique constraint: `@@unique([userId, alertGroupId])`
- `sentAt` is null unless status is `delivered`

---

## Integration Points

| Direction | Requirement | Detail |
|-----------|-------------|--------|
| Upstream  | REQ-6 trade worker | Calls `deliverAlertGroup` after each new AlertGroup |
| Upstream  | REQ-7 context engine & formatter | `computeContextLabel` and `formatAlertMessage` called per delivery |
| Upstream  | REQ-9 monetization | `PlanCategoryAccess` and `isSubscribed` determine quota bypass |
| Upstream  | REQ-2 category system | Category subscription check |
| Reads     | REQ-1 schema | `User`, `AlertGroup`, `AppSetting`, `PlanCategoryAccess` |
| Writes    | This requirement | `UserAlertDelivery` (new table) |

---

## Out of Scope

- Push retry logic — v2
- Batch or bulk Telegram sends — sequential only in v1
- Per-category alert frequency limits — v2
- Delivery analytics dashboard — REQ-11 extension

---

## Acceptance Criteria

- [ ] Given a free-tier user who has received fewer than `free_alert_quota` delivered alerts, When `deliverAlertGroup` is called for an AlertGroup in a subscribed category, Then a Telegram message is sent and a `UserAlertDelivery` record with `status = "delivered"` is written
- [ ] Given a free-tier user who has received `free_alert_quota` or more delivered alerts, When `deliverAlertGroup` is called, Then no Telegram message is sent and a `UserAlertDelivery` record with `status = "quota_exceeded"` is written
- [ ] Given a Pro user (isSubscribed = true) who has received more than 10 alerts, When `deliverAlertGroup` is called for an eligible category, Then the message is sent without quota enforcement
- [ ] Given a user who has not subscribed to the alert's category, When `deliverAlertGroup` is called, Then no delivery record is written for that user
- [ ] Given a user whose plan does not grant access to the alert's category via `PlanCategoryAccess`, When `deliverAlertGroup` is called, Then no delivery record is written for that user
- [ ] Given a user with `isActive = false`, When `deliverAlertGroup` is called, Then no delivery record is written for that user
- [ ] Given `bot.sendMessage` throws for one user, When `deliverAlertGroup` is processing multiple users, Then a `UserAlertDelivery` record with `status = "failed"` and a non-null `errorMessage` is written for that user and delivery continues to remaining users
- [ ] Given `deliverAlertGroup` completes for an AlertGroup with 3 eligible users, When the `UserAlertDelivery` table is queried, Then exactly 3 records exist for that `alertGroupId`
- [ ] Given the `free_alert_quota` AppSetting is updated from 10 to 5, When `deliverAlertGroup` is next called, Then the new quota value is used without restarting the service
- [ ] Given `deliverAlertGroup` is called twice for the same alertGroupId and userId, When the second call runs, Then no duplicate delivery record is created and no second message is sent
```

---
