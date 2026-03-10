import { prisma } from "../db/client";
import { config } from "../config";

const GAMMA_API_BASE = "https://gamma-api.polymarket.com";
const FETCH_TIMEOUT_MS = 10_000;

export class PolymarketApiError extends Error {
  public readonly statusCode: number;
  public readonly body: string;

  constructor(message: string, statusCode: number, body: string) {
    super(message);
    this.name = "PolymarketApiError";
    this.statusCode = statusCode;
    this.body = body;
  }
}

export interface NormalizedTrader {
  walletAddress: string;
  rank: number;
  categorySlug: string;
  pnl: number;
  volume: number;
  markets: number;
}

export interface NormalizedTrade {
  transactionHash: string;
  walletAddress: string;
  marketExternalId: string;
  action: string;
  size: number;
  price: number;
  outcome: string;
  tradedAt: Date;
}

export interface NormalizedMarket {
  externalId: string;
  title: string;
  canonicalUrl: string;
}

async function getAppSetting(key: string): Promise<string> {
  const setting = await prisma.appSetting.findUnique({ where: { key } });
  if (!setting) {
    throw new Error(`AppSetting "${key}" not found in database`);
  }
  return setting.value;
}

async function apiFetch(url: string): Promise<Response> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new PolymarketApiError(
      `Polymarket API error: ${response.status} ${response.statusText}`,
      response.status,
      body
    );
  }

  return response;
}

export function normalizeTrader(
  entry: Record<string, unknown>,
  categorySlug: string
): NormalizedTrader {
  return {
    walletAddress: String(entry.userAddress ?? entry.address ?? ""),
    rank: Number(entry.rank ?? 0),
    categorySlug,
    pnl: Number(entry.pnl ?? 0),
    volume: Number(entry.volume ?? 0),
    markets: Number(entry.markets ?? 0),
  };
}

export function normalizeTrade(
  trade: Record<string, unknown>
): NormalizedTrade {
  return {
    transactionHash: String(trade.transactionHash ?? ""),
    walletAddress: String(trade.taker ?? trade.user ?? ""),
    marketExternalId: String(trade.market ?? trade.conditionId ?? ""),
    action: String(trade.side ?? trade.type ?? ""),
    size: Number(trade.size ?? trade.amount ?? 0),
    price: Number(trade.price ?? 0),
    outcome: String(trade.outcome ?? trade.asset ?? ""),
    tradedAt: new Date(String(trade.matchTime ?? trade.timestamp ?? trade.createdAt ?? Date.now())),
  };
}

export function normalizeMarket(
  market: Record<string, unknown>
): NormalizedMarket {
  return {
    externalId: String(market.condition_id ?? market.conditionId ?? ""),
    title: String(market.question ?? market.title ?? ""),
    canonicalUrl: String(
      market.market_slug
        ? `https://polymarket.com/event/${market.market_slug}`
        : market.url ?? ""
    ),
  };
}

export async function fetchLeaderboard(
  categorySlug: string
): Promise<NormalizedTrader[]> {
  const trackedTradersPerCategory = await getAppSetting(
    "trackedTradersPerCategory"
  );
  const limit = parseInt(trackedTradersPerCategory, 10);

  const category = await prisma.category.findUnique({
    where: { slug: categorySlug },
  });

  if (!category) {
    throw new Error(`Category with slug "${categorySlug}" not found`);
  }

  if (!category.sourceIdentifier) {
    throw new Error(
      `Category "${categorySlug}" has no sourceIdentifier configured`
    );
  }

  const params = new URLSearchParams({
    timePeriod: "ALL",
    orderBy: "PNL",
    limit: String(limit),
    category: category.sourceIdentifier,
  });

  const url = `${config.polymarketApiBaseUrl}/v1/leaderboard?${params.toString()}`;
  const response = await apiFetch(url);
  const data = (await response.json()) as Record<string, unknown>[];

  return data
    .map((entry, index) => {
      const trader = normalizeTrader(entry, categorySlug);
      if (trader.rank === 0) {
        trader.rank = index + 1;
      }
      return trader;
    })
    .sort((a, b) => a.rank - b.rank);
}

export async function fetchRecentTrades(
  walletAddress: string
): Promise<NormalizedTrade[]> {
  const minTradeSizeStr = await getAppSetting("minTradeSize");
  const minTradeSize = parseInt(minTradeSizeStr, 10);

  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const afterTimestamp = Math.floor(twentyFourHoursAgo.getTime() / 1000);

  const params = new URLSearchParams({
    user: walletAddress,
    takerOnly: "true",
    filterType: "CASH",
    filterAmount: String(minTradeSize),
    after: String(afterTimestamp),
  });

  const url = `${config.polymarketApiBaseUrl}/trades?${params.toString()}`;
  const response = await apiFetch(url);
  const data = (await response.json()) as Record<string, unknown>[];

  return data
    .map((entry) => normalizeTrade(entry))
    .filter((trade) => trade.transactionHash !== "")
    .sort((a, b) => b.tradedAt.getTime() - a.tradedAt.getTime());
}

export async function fetchMarketMetadata(
  externalId: string
): Promise<NormalizedMarket> {
  const params = new URLSearchParams({
    condition_ids: externalId,
  });

  const url = `${GAMMA_API_BASE}/markets?${params.toString()}`;
  const response = await apiFetch(url);
  const data = (await response.json()) as Record<string, unknown>[];

  if (!Array.isArray(data) || data.length === 0) {
    throw new PolymarketApiError(
      `Market not found for condition_id "${externalId}"`,
      404,
      "[]"
    );
  }

  return normalizeMarket(data[0]);
}

export const polymarketSource = {
  fetchLeaderboard,
  fetchRecentTrades,
  fetchMarketMetadata,
};
