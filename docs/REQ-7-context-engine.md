## 📄 `docs/REQ-7-context-engine.md`

```markdown
# REQ-7: Whale Context Engine & Alert Formatting

## Overview
Implement `src/services/contextEngine.ts` and `src/services/alertFormatter.ts` — the layer that transforms a raw `AlertGroup` into a fully formatted Telegram alert message with a plain-language context label, trader ROI, position details, and an affiliate link.

## Problem Statement
Without context labels and formatted messages, alert delivery (REQ-8) has no content to send. Raw trade data (wallet addresses, numeric prices, bare market IDs) is unreadable to end users.

## Solution
The context engine inspects the trader's trade history for the current market to assign a label. The formatter assembles all alert fields — alias, ROI, action, market name, size, price, context label, affiliate link — into a Telegram-ready message string.

---

## Functional Requirements

### Context Label Computation

The context engine receives an `AlertGroup` and returns one of the following labels (evaluate top-to-bottom, assign first match):

| Label                | Condition                                                                                                                     |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `First entry`        | Trader has no prior `AlertGroup` records for this market before this one                                                      |
| `Second buy today`   | Trader has exactly 1 prior `AlertGroup` with `action = "buy"` for this market within the current calendar day (UTC)           |
| `Scaling position`   | Trader has 2 or more prior `AlertGroup` records with `action = "buy"` for this market within the current calendar day (UTC)   |
| `Adding to position` | Trader has prior `AlertGroup` records for this market on a previous calendar day (UTC), and current action is `buy`           |
| `Reducing position`  | Current `AlertGroup.action = "sell"` and trader has prior buy groups for this market                                          |
| `Exiting position`   | Current `AlertGroup.action = "sell"` and no prior buy groups exist for this market (or all prior buys have been fully exited) |

**History scope**: Only `AlertGroup` records with `createdAt` before the current group's `createdAt` are considered (not the current group itself).

**Important**: The context engine queries only the `AlertGroup` table — it does not query `Trade` directly.

---

### Alert Message Format

Message template (Telegram MarkdownV2):
```
🐋 *{alias}* \| ROI: {roi30d}

{action} {outcome} — {marketName}
💰 {totalSize} @ {price}

_{contextLabel}_

[View on Polymarket]({affiliateLink})
```

**Field specifications:**

| Field         | Source                    | Format                                                                 |
| ------------- | ------------------------- | ---------------------------------------------------------------------- |
| alias         | `Trader.alias`            | Plain string, MarkdownV2-escaped                                       |
| roi30d        | `Trader.roi30d`           | Multiply by 100, format as `+12.4%` or `-3.1%` (1 decimal, sign always shown). `roi30d = 0` → `+0.0%` |
| action        | `AlertGroup.action`       | Uppercase: `BUY` or `SELL`                                             |
| outcome       | `AlertGroup.outcome`      | Plain string, MarkdownV2-escaped (e.g. `Yes`, `No`)                    |
| marketName    | `Market.title`            | Plain string, MarkdownV2-escaped                                       |
| totalSize     | `AlertGroup.totalSize`    | Dollar sign + comma separator, no decimals: `$1,250`                   |
| price         | `AlertGroup.price`        | Multiply by 100, round to nearest integer: `0.67` → `67%`             |
| contextLabel  | computed by context engine| Plain string, rendered in italics via surrounding `_` in template      |
| affiliateLink | `Market.slug`             | `https://polymarket.com/event/{slug}?ref=whaleradar`                   |

**Null/empty handling:**
- If `Trader.roi30d` is null: omit the entire first line (`🐋 *{alias}* \| ROI: {roi30d}`) and replace with just `🐋 *{alias}*`
- If `Market.slug` is null or empty: omit the `[View on Polymarket](...)` line entirely

**MarkdownV2 escaping:**
- Escape these characters in ALL dynamic field values: `_ * [ ] ( ) ~ \` > # + - = | { } . !`
- Do NOT escape the structural template characters (the `*`, `_`, `\|`, `[`, `]`, `(`, `)` that are part of the template itself)

---

## Technical Requirements

- `contextEngine.ts` exports a single function: `computeContextLabel(alertGroup: AlertGroup): Promise<ContextLabel>`
- `alertFormatter.ts` exports a single function: `formatAlertMessage(alertGroup: AlertGroup, trader: Trader, market: Market, label: ContextLabel): string`
- `ContextLabel` is a TypeScript union type exported from `contextEngine.ts`:
  ```typescript
  export type ContextLabel =
    | 'First entry'
    | 'Second buy today'
    | 'Scaling position'
    | 'Adding to position'
    | 'Reducing position'
    | 'Exiting position';
  ```
- Both modules import the Prisma client from `src/db/client.ts`
- Neither module imports from `src/bot/` or `src/workers/`
- All date comparisons use UTC

---

## Data Model

**No new tables.** Reads from existing tables only.

| Table      | Fields read                                          |
| ---------- | ---------------------------------------------------- |
| AlertGroup | `traderId`, `marketId`, `action`, `totalSize`, `price`, `createdAt` |
| Trader     | `alias`, `roi30d` (Decimal 0–1, e.g. `0.42` = 42%)  |
| Market     | `title`, `slug`                                      |

---

## Integration Points

- **Upstream**: REQ-6 trade worker — produces `AlertGroup` records
- **Downstream**: REQ-8 alert delivery — calls `computeContextLabel` then `formatAlertMessage` before sending each alert
- **Reads**: `Trader` (alias from REQ-4), `Market` (upserted by REQ-6)

---

## Out of Scope

- Alert delivery to Telegram — REQ-8
- Per-language formatting — REQ-10 wraps this formatter's output
- Cross-market context labels — v2
- ML-based inference — v2

---

## Acceptance Criteria

- [ ] Given a trader has no prior AlertGroup records for a market, When `computeContextLabel` is called, Then it returns `"First entry"`
- [ ] Given a trader has exactly 1 prior buy AlertGroup for a market on the current UTC day, When `computeContextLabel` is called with a buy group, Then it returns `"Second buy today"`
- [ ] Given a trader has 2 or more prior buy AlertGroups for a market on the current UTC day, When `computeContextLabel` is called with a buy group, Then it returns `"Scaling position"`
- [ ] Given a trader has prior buy AlertGroups for a market only on previous UTC days, When `computeContextLabel` is called with a buy group, Then it returns `"Adding to position"`
- [ ] Given a trader has prior buy AlertGroups for a market, When `computeContextLabel` is called with a sell group, Then it returns `"Reducing position"`
- [ ] Given a trader has no prior buy AlertGroups for a market, When `computeContextLabel` is called with a sell group, Then it returns `"Exiting position"`
- [ ] Given an AlertGroup with all fields populated and `roi30d = 0.124`, When `formatAlertMessage` is called, Then the output contains `+12.4%` for ROI, action in uppercase, size as `$X,XXX`, price as `XX%`, context label in italics, and affiliate link
- [ ] Given `Trader.roi30d` is null, When `formatAlertMessage` is called, Then the ROI field and its separator are omitted from the output
- [ ] Given `Market.slug` is null or empty, When `formatAlertMessage` is called, Then the affiliate link line is omitted from the output
- [ ] Given a market name containing MarkdownV2 special characters, When `formatAlertMessage` is called, Then all special characters in dynamic fields are escaped and the message is valid MarkdownV2
- [ ] Given the context engine module is imported, When its imports are inspected, Then it contains no imports from `src/bot/` or `src/workers/`
- [ ] Given the formatter module is imported, When its imports are inspected, Then it contains no imports from `src/bot/` or `src/workers/`
```

---
