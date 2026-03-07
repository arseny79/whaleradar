# Multilingual i18n System

## Overview
Add a translation layer to the WhaleRadar Telegram bot so all user-facing strings are served in English, Russian, or Latvian based on each user's stored language preference.

## Problem Statement
All bot messages are currently hardcoded in English across REQ-3 command handlers, REQ-7 alert formatting, and REQ-9 payment messages. There is no mechanism to resolve a user's language at request time or look up translated strings.

## Solution
Three JSON translation files under `src/i18n/`, a `t(key, lang, params?)` lookup function with EN fallback, and a Telegraf middleware registered globally in `src/bot/index.ts` that resolves user language and attaches `ctx.t()`. All hardcoded strings in REQ-3, REQ-7, and REQ-9 are migrated to use namespaced keys.

---

## Functional Requirements

### Translation Files
- Create `src/i18n/en.json`, `src/i18n/ru.json`, `src/i18n/lv.json`
- All three files must contain identical key sets; missing keys in `ru` or `lv` fall back to `en`
- Keys are namespaced using dot notation:

| Namespace               | Covers                                              |
| ----------------------- | --------------------------------------------------- |
| `commands.start.*`      | Welcome, category prompt, quota explanation         |
| `commands.help.*`       | Command list and descriptions                       |
| `commands.pricing.*`    | Plan names, prices, CTA labels                      |
| `commands.subscribe.*`  | Subscription status, invoice prompt                 |
| `commands.categories.*` | Selection prompt, done confirmation, empty error    |
| `commands.language.*`   | Picker prompt, confirmation                         |
| `alerts.*`              | Alert message templates, context labels             |
| `payments.*`            | Invoice title/description, success/failure messages |

- String interpolation uses `{{placeholder}}` syntax (e.g., `"Welcome, {{firstName}}!"`)

### `t()` Lookup Function
- Signature: `t(key: string, lang: 'en' | 'ru' | 'lv', params?: Record<string, string | number>): string`
- Resolves key in the requested language's JSON; falls back to `en` if the key is absent
- Replaces all `{{placeholder}}` tokens with values from `params`
- If the key is missing in both the requested language and `en`, returns the key string (never throws)
- Exported from `src/i18n/index.ts`

### Language Resolution Middleware
- Registered globally in `src/bot/index.ts` **before** all command handlers
- Resolution order per request:
  1. In-memory `Map<telegramId, { lang, cachedAt }>` with 5-minute TTL
  2. `User.languageCode` from the database (if cache miss or expired)
  3. `ctx.from.language_code` mapped to `en | ru | lv` (if no DB record)
  4. Default: `'en'`
- `ctx.from.language_code` may include subtags (e.g., `'ru-RU'`, `'lv-LV'`). Extract the primary subtag (before `-`) and map to `SupportedLang`; if the primary subtag is not in `['en', 'ru', 'lv']`, fall back to `'en'`
- Attaches `ctx.t(key, params?)` — a pre-bound wrapper that calls `t(key, resolvedLang, params)`
- Cache entries are written after every successful DB lookup
- Cache entries are invalidated when `/language` updates `User.languageCode`

### String Migration
Migrate all hardcoded strings in the following files to use `ctx.t()` or `t()`:

| Source                                            | Scope                                                |
| ------------------------------------------------- | ---------------------------------------------------- |
| REQ-3 command handlers (`src/bot/commands/*.ts`)  | All user-facing messages and keyboard labels         |
| REQ-7 alert formatter (`src/alerts/formatter.ts`) | Alert message template, context label strings        |
| REQ-9 payment handler (`src/payments/*.ts`)       | Invoice title, description, success/failure messages |

- No hardcoded English strings may remain in any of the above files after migration
- Alert formatter receives `lang` as a parameter (passed from the user record at fanout time) and calls `t()` directly — it does not use `ctx.t()` since it runs outside a request context

---

## Technical Requirements

### File Structure
src/ i18n/ en.json ru.json lv.json index.ts ← exports t(), supported langs, cache invalidation bot/ index.ts ← middleware registered here middleware/ i18n.ts ← language resolution middleware
### Type Safety
- `SupportedLang` type: `'en' | 'ru' | 'lv'`
- Translation key paths typed via a recursive `DeepKeys<T>` utility or a flat string union — either approach is acceptable; key must be a `string` at minimum
- `ctx` extended via Telegraf's context typing to include `t(key: string, params?: Record<string, string | number>): string`

### Cache Invalidation
- Export `invalidateLangCache(telegramId: string): void` from `src/i18n/index.ts`
- `/language` command handler calls this after updating `User.languageCode`

### No External i18n Libraries
- Implement `t()` directly; do not introduce `i18next`, `typesafe-i18n`, or similar packages

### Cache Storage
- The language cache `Map<string, { lang: SupportedLang; cachedAt: number }>` is a module-level singleton in `src/bot/middleware/i18n.ts` — no constructor injection required

---

## Data Model

No schema changes. `User.languageCode` (existing field, type `String`, values `'en' | 'ru' | 'lv'`) is the source of truth. The in-memory cache is runtime state only.

---

## Out of Scope
- Languages beyond EN, RU, LV
- Pluralization rules (not required for v1 string set)
- Locale-aware number/date formatting
- Dynamic translation loading or hot-reload

---

## Acceptance Criteria

- [ ] Given `en.json`, `ru.json`, and `lv.json` exist, When any key present in `en.json` is looked up in `ru.json` or `lv.json`, Then all three files contain the same key set with no missing keys
- [ ] Given `t('commands.start.welcome', 'ru', { firstName: 'Alex' })` is called, When `ru.json` contains the key with `{{firstName}}`, Then the returned string is in Russian with `{{firstName}}` replaced by `'Alex'`
- [ ] Given a key exists in `en.json` but is absent from `ru.json`, When `t(key, 'ru')` is called, Then the English string is returned
- [ ] Given a key is absent from both `en.json` and `ru.json`, When `t(key, 'ru')` is called, Then the key string itself is returned and no exception is thrown
- [ ] Given a user with `User.languageCode = 'lv'` sends any command, When the middleware runs, Then `ctx.t('commands.help.title')` returns the Latvian string
- [ ] Given the middleware resolved a user's language from the DB, When the same user sends a second request within 5 minutes, Then no DB query is made and the cached language is used
- [ ] Given the cache entry is older than 5 minutes, When the user sends a request, Then the middleware re-queries the DB and refreshes the cache
- [ ] Given a user with no DB record and `ctx.from.language_code = 'ru'`, When the middleware runs, Then `ctx.t()` resolves to Russian strings
- [ ] Given a user with no DB record and `ctx.from.language_code = 'de'` (unmapped), When the middleware runs, Then `ctx.t()` resolves to English strings
- [ ] Given the `/language` command updates `User.languageCode` to `'ru'`, When `invalidateLangCache(telegramId)` is called, Then the next request for that user re-queries the DB
- [ ] Given the middleware is registered in `src/bot/index.ts`, When any command handler accesses `ctx.t()`, Then the function is available without importing `t()` directly
- [ ] Given REQ-3 command handlers are migrated, When a grep for hardcoded English strings (e.g., `'Welcome'`, `'Choose your categories'`) is run on `src/bot/commands/`, Then no matches are found
- [ ] Given REQ-7 alert formatter is migrated, When `formatAlert(trade, lang)` is called with `lang = 'ru'`, Then the returned message string contains Russian text
- [ ] Given REQ-9 payment handler is migrated, When an invoice is generated for a Russian-language user, Then the invoice title and description are in Russian
