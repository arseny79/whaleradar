# REQ-3: User Onboarding & Bot Commands — /start, /help, /pricing, /subscribe, /categories, /language

## Overview
Implement the Telegram bot's full command surface: a guided `/start` onboarding flow plus five supporting commands that cover discovery, category management, and subscription.

## Problem Statement
New users arrive with no context about what the bot does, what they get for free, or how to configure it. Without a structured onboarding flow and clear command handlers, users cannot set up their preferences or understand the value proposition.

## Solution
Six command handlers that share i18n strings, the category keyboard from REQ-2, and user persistence from REQ-1's Prisma schema. `/start` is the primary onboarding entry point; the remaining five commands handle ongoing configuration and discovery.

---

## UX / UI Layout

### /start Flow
Linear, 3 screens:
1. **Welcome message** — bot name, one-line value proposition, detected language confirmation
2. **Category selection screen** — inline keyboard built by `buildCategoryKeyboard()` from REQ-2
3. **Quota explanation screen** — explains the 10 free alerts limit with a "See pricing" CTA

Each screen is a separate message — no inline menus stacked on a single message.

### /categories Command
Inline keyboard with ✅ prefix on currently selected categories. A "Done" button confirms the updated selection.

### /language Command
Three buttons in a single-column inline keyboard: English, Русский, Latviešu. Current language has ✅ prefix. Selecting a language updates the preference and confirms in the new language.

### /help, /pricing, /subscribe
Text-only responses. `/subscribe` includes a "Pay with Telegram" button for free-tier users.

---

## Functional Requirements

### Command: /start
- Detect language from `ctx.from.language_code`; map to `en`, `ru`, or `lv`; default to `en` if unmapped
- Create or update the `User` record: `telegramId`, `username`, `firstName`, `languageCode`
- Send welcome message using detected language's i18n strings
- Send category selection keyboard via `buildCategoryKeyboard(getActiveVisibleCategories())`
- After category selection callback, save to `UserCategoryPreference` (upsert — re-running `/start` must not duplicate rows)
- Send quota explanation message with free alert count from `AppSetting` where `key = 'free_alert_quota'`
- If user already exists and has categories set, `/start` re-runs the full flow (re-onboarding is allowed)

### Command: /help
- Send a single message listing all available commands with one-line descriptions
- Fully i18n'd — no hardcoded English strings in the handler

### Command: /pricing
- Fetch active plans from the database (ordered by price ASC)
- Render each plan's name, price, billing period, and included category access
- Free plan shows current alert quota remaining for this user
- Pro plan shows a "Subscribe" button that triggers the `/subscribe` flow

### Command: /subscribe
- If user is already on Pro: send confirmation message with subscription expiry date; no payment flow
- If user is on Free: call the payment service interface (defined in REQ-9) to initiate a Telegram Payments invoice — no inline payment logic in this handler

### Command: /categories
- Fetch `getActiveVisibleCategories()` and the user's current `UserCategoryPreference` rows
- Render inline keyboard with ✅ prefix on currently selected categories
- Handle `select_category:{slug}` callbacks: toggle the category (add if absent, remove if present)
- Handle `category_page:{page}` callbacks: re-render keyboard at the requested page
- "Done" button (callback `categories_done`) edits the message to a confirmation listing selected category names
- If user taps Done with zero categories selected: send error asking them to select at least one

### Command: /language
- Render inline keyboard: `lang:en`, `lang:ru`, `lang:lv`
- Current language has ✅ prefix
- On selection: update `User.languageCode`; send confirmation in the **new** language
- If user selects the already-active language: acknowledge without re-writing the DB row

---

## Technical Requirements

### File Structure
- Each command is a separate handler file under `src/bot/commands/`
- Shared utilities (language detection, user upsert) in `src/bot/utils/`
- All handlers registered on the Telegraf bot instance from REQ-1

### User Upsert
- `upsertUser(ctx)` utility: creates or updates `User` on every `/start` call
- Fields from `ctx.from`: `telegramId`, `username`, `firstName`, `languageCode`
- Returns the full `User` record

### i18n Integration
- All user-facing strings sourced from i18n JSON files (REQ-10)
- Handlers use a `t(key)` translation function — no hardcoded strings
- If REQ-10 is not yet implemented, stub `t` with English fallback strings

### Data Model — UserCategoryPreference (new table)
- `id`: Int (autoincrement)
- `userId`: Int (FK → User)
- `categoryId`: Int (FK → Category)
- `createdAt`: DateTime
- Unique constraint: `@@unique([userId, categoryId])`
- Cascade delete on User delete and Category delete

### Callback Query Handling
- Register callbacks: `select_category:{slug}`, `category_page:{page}`, `categories_done`, `lang:{code}`
- Every callback calls `ctx.answerCbQuery()` to dismiss the Telegram loading indicator
- Message edits use `ctx.editMessageText()` or `ctx.editMessageReplyMarkup()`

### Error Handling
- If `getActiveVisibleCategories()` returns empty: send error message, do not render empty keyboard
- If DB is unreachable: send generic error in user's last known language (fallback `en`); no unhandled exceptions
- All handlers wrapped in try/catch; errors logged with `telegramId` and command name

---

## Out of Scope
- Payment invoice generation and webhook handling — REQ-9
- i18n JSON file content and language middleware — REQ-10
- Admin panel command management — REQ-11
- Deep-linking (`/start ref_code`) — not in v1

---

## Acceptance Criteria

- [ ] Given a new user with `language_code = 'ru'`, When they send `/start`, Then a new `User` row is created with `languageCode = 'ru'` and the welcome message is sent in Russian
- [ ] Given a user with `language_code = 'de'` (unmapped), When they send `/start`, Then `languageCode` defaults to `'en'` and the welcome message is sent in English
- [ ] Given an existing user re-sends `/start`, When the handler runs, Then the `User` row is updated (not duplicated) and the full onboarding flow replays
- [ ] Given active visible categories exist, When `/start` reaches category selection, Then an inline keyboard is rendered using `buildCategoryKeyboard()` output
- [ ] Given a user taps `select_category:crypto`, When the callback is processed, Then a `UserCategoryPreference` row is inserted and the keyboard re-renders with ✅ on that category
- [ ] Given a user taps the same category again, When the callback is processed, Then the `UserCategoryPreference` row is deleted and the ✅ is removed
- [ ] Given a user taps "Done" with zero categories selected, When the callback is processed, Then no DB write occurs and an error message is sent
- [ ] Given a user taps "Done" with at least one category selected, When the callback is processed, Then the keyboard message is edited to a confirmation listing selected category names
- [ ] Given `/start` completes category selection, When the quota message is sent, Then the free alert count matches `AppSetting` where `key = 'free_alert_quota'`
- [ ] Given a user sends `/help`, When the handler runs, Then all six commands are listed with descriptions in the user's stored language
- [ ] Given a user sends `/pricing`, When the handler runs, Then all active plans are listed with name, price, and category access; free plan shows remaining alert count
- [ ] Given a free-tier user sends `/subscribe`, When the handler runs, Then the payment service's invoice method is called and a Telegram invoice is sent
- [ ] Given a Pro-tier user sends `/subscribe`, When the handler runs, Then a confirmation with subscription expiry is sent and no invoice is generated
- [ ] Given a user sends `/language` and selects `lang:lv`, When the callback is processed, Then `User.languageCode` is updated to `'lv'` and confirmation is sent in Latvian
- [ ] Given a user selects their already-active language, When the callback is processed, Then no DB write occurs and an acknowledgement is sent
- [ ] Given `getActiveVisibleCategories()` returns empty, When `/categories` is called, Then an error message is sent and no keyboard is rendered
- [ ] Given the DB is unreachable during any command, When the handler runs, Then a generic error is sent and no unhandled exception propagates
