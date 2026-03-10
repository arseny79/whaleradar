import { AlertGroup, Trader, Market } from "@prisma/client";
import { resolveAlias } from "./traderService";
import { ContextLabel } from "./contextEngine";
import { Decimal } from "@prisma/client/runtime/library";
import { SupportedLang, t } from "../i18n";

interface AlertGroupContext {
  action: string;
  outcome: string;
  price: number;
  categoryId: number;
}

const MD2_SPECIAL = /([_*\[\]()~`>#+\-=|{}.!])/g;

function escMd2(text: string): string {
  return text.replace(MD2_SPECIAL, "\\$1");
}

function formatRoi(roi30d: Decimal | null): string | null {
  if (roi30d === null) return null;
  const pct = Number(roi30d) * 100;
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}%`;
}

function formatDollar(size: Decimal): string {
  const num = Math.round(Number(size));
  return "$" + num.toLocaleString("en-US");
}

function formatPrice(price: number): string {
  return Math.round(price * 100) + "%";
}

function parseContext(contextStr: string): AlertGroupContext {
  return JSON.parse(contextStr) as AlertGroupContext;
}

export function formatAlertMessage(
  alertGroup: AlertGroup,
  trader: Trader,
  market: Market,
  label: ContextLabel,
  lang: SupportedLang = "en"
): string {
  const alias = resolveAlias(trader);
  const context = parseContext(alertGroup.context);

  const roiStr = formatRoi(trader.roi30d);
  const sizeStr = formatDollar(alertGroup.totalSize);
  const priceStr = formatPrice(context.price);
  const action = context.action.toUpperCase();
  const outcome = context.outcome || "";

  const escapedAlias = escMd2(alias);
  const escapedLabel = escMd2(label);
  const escapedAction = escMd2(action);
  const escapedOutcome = escMd2(outcome);
  const escapedSize = escMd2(sizeStr);
  const escapedPrice = escMd2(priceStr);
  const escapedTitle = escMd2(market.title);

  let firstLine: string;
  if (roiStr !== null) {
    const escapedRoi = escMd2(roiStr);
    firstLine = t("alerts.whale_with_roi", lang, { alias: escapedAlias, roi: escapedRoi });
  } else {
    firstLine = t("alerts.whale_no_roi", lang, { alias: escapedAlias });
  }

  const lines: string[] = [
    firstLine,
    t("alerts.context_label", lang, { label: escapedLabel }),
    t("alerts.trade_line", lang, { action: escapedAction, outcome: escapedOutcome, size: escapedSize, price: escapedPrice }),
    t("alerts.market_title", lang, { title: escapedTitle }),
  ];

  if (market.affiliateUrl && market.affiliateUrl.trim().length > 0) {
    const escapedUrl = escMd2(market.affiliateUrl);
    lines.push(t("alerts.view_link", lang, { url: escapedUrl }));
  }

  return lines.join("\n");
}
