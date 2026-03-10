import { prisma } from "../db/client";
import { findOrCreateTrader } from "../services/traderService";
import {
  polymarketSource,
  PolymarketApiError,
  NormalizedTrade,
} from "../sources/polymarket";
import { Decimal } from "@prisma/client/runtime/library";
import { deliverAlertGroup } from "../services/alertDeliveryService";

let isRunning = false;
let currentIntervalMs = 30_000;
let intervalHandle: ReturnType<typeof setInterval> | null = null;
let cyclePromise: Promise<void> | null = null;

interface AlertGroupContext {
  action: string;
  outcome: string;
  price: number;
  categoryId: number;
}

async function getAppSettings(): Promise<{
  minTradeSize: number;
  mergeWindowMinutes: number;
  pollingIntervalSeconds: number;
}> {
  const [minTradeSizeSetting, mergeWindowSetting, pollingSetting] = await Promise.all([
    prisma.appSetting.findUnique({ where: { key: "minTradeSize" } }),
    prisma.appSetting.findUnique({ where: { key: "mergeWindowMinutes" } }),
    prisma.appSetting.findUnique({ where: { key: "pollingIntervalSeconds" } }),
  ]);

  return {
    minTradeSize: parseInt(minTradeSizeSetting?.value ?? "250", 10),
    mergeWindowMinutes: parseInt(mergeWindowSetting?.value ?? "15", 10),
    pollingIntervalSeconds: parseInt(pollingSetting?.value ?? "30", 10),
  };
}

function mostFrequentAction(actions: string[]): string {
  const counts = new Map<string, number>();
  for (const a of actions) {
    counts.set(a, (counts.get(a) ?? 0) + 1);
  }
  let maxCount = 0;
  let result = actions[0];
  for (const [action, count] of counts) {
    if (count > maxCount) {
      maxCount = count;
      result = action;
    }
  }
  return result;
}

async function runCycle(): Promise<void> {
  const startTime = Date.now();
  let status = "success";
  let message: string | null = null;
  let errorText: string | null = null;
  let tradersChecked = 0;
  let tradesFound = 0;
  let alertsSent = 0;

  try {
    const settings = await getAppSettings();

    const newIntervalMs = settings.pollingIntervalSeconds * 1000;
    if (newIntervalMs !== currentIntervalMs && intervalHandle !== null) {
      currentIntervalMs = newIntervalMs;
      clearInterval(intervalHandle);
      intervalHandle = setInterval(() => {
        tick().catch((err) => {
          console.error("[tradeWorker] Unhandled tick error:", err);
          isRunning = false;
        });
      }, currentIntervalMs);
      console.log(`[tradeWorker] Interval updated to ${settings.pollingIntervalSeconds}s`);
    }

    const categories = await prisma.category.findMany({
      where: { isActive: true },
    });

    for (const category of categories) {
      if (!category.sourceIdentifier) continue;

      let leaderboard;
      try {
        leaderboard = await polymarketSource.fetchLeaderboard(category.slug);
      } catch (err) {
        if (err instanceof PolymarketApiError) {
          console.warn(
            `[tradeWorker] Leaderboard fetch failed for ${category.slug}: ${err.message}`
          );
          continue;
        }
        throw err;
      }

      for (const normalizedTrader of leaderboard) {
        const trader = await findOrCreateTrader(
          normalizedTrader.walletAddress,
          category.id,
          normalizedTrader.rank
        );

        if (!trader.isTracked) continue;

        tradersChecked++;

        let trades: NormalizedTrade[];
        try {
          trades = await polymarketSource.fetchRecentTrades(
            trader.walletAddress
          );
        } catch (err) {
          console.warn(
            `[tradeWorker] fetchRecentTrades failed for ${trader.walletAddress}: ${err instanceof Error ? err.message : err}`
          );
          continue;
        }

        const filteredTrades = trades.filter(
          (t) => t.size >= settings.minTradeSize
        );

        tradesFound += filteredTrades.length;

        for (const normalizedTrade of filteredTrades) {
          const existingTrade = await prisma.trade.findUnique({
            where: { externalId: normalizedTrade.transactionHash },
          });
          if (existingTrade) continue;

          let market;
          try {
            const marketMeta = await polymarketSource.fetchMarketMetadata(
              normalizedTrade.marketExternalId
            );

            market = await prisma.market.upsert({
              where: { externalId: marketMeta.externalId },
              update: {
                title: marketMeta.title,
                canonicalUrl: marketMeta.canonicalUrl,
              },
              create: {
                externalId: marketMeta.externalId,
                title: marketMeta.title,
                canonicalUrl: marketMeta.canonicalUrl,
                source: "polymarket",
              },
            });
          } catch (err) {
            console.warn(
              `[tradeWorker] fetchMarketMetadata failed for ${normalizedTrade.marketExternalId}: ${err instanceof Error ? err.message : err}`
            );
            continue;
          }

          const newTrade = await prisma.trade.create({
            data: {
              traderId: trader.id,
              marketId: market.id,
              action: normalizedTrade.action,
              size: new Decimal(normalizedTrade.size),
              price: new Decimal(normalizedTrade.price),
              outcome: normalizedTrade.outcome,
              tradedAt: normalizedTrade.tradedAt,
              source: "polymarket",
              externalId: normalizedTrade.transactionHash,
            },
          });

          const mergeWindowStart = new Date(
            Date.now() - settings.mergeWindowMinutes * 60 * 1000
          );

          const openGroup = await prisma.alertGroup.findFirst({
            where: {
              traderId: trader.id,
              marketId: market.id,
              createdAt: { gte: mergeWindowStart },
            },
            include: { trade: true },
          });

          if (openGroup) {
            const mergedTrades = await prisma.trade.findMany({
              where: {
                traderId: trader.id,
                marketId: market.id,
                tradedAt: { gte: mergeWindowStart },
              },
            });

            const allActions = mergedTrades.map((t) => t.action);
            const newAction = mostFrequentAction(allActions);

            const existingContext: AlertGroupContext = JSON.parse(
              openGroup.context
            );

            const updatedContext: AlertGroupContext = {
              action: newAction,
              outcome: existingContext.outcome,
              price: existingContext.price,
              categoryId: existingContext.categoryId,
            };

            const newTotalSize = openGroup.totalSize.add(
              new Decimal(normalizedTrade.size)
            );

            await prisma.alertGroup.update({
              where: { id: openGroup.id },
              data: {
                totalSize: newTotalSize,
                tradeCount: openGroup.tradeCount + 1,
                context: JSON.stringify(updatedContext),
              },
            });

            await deliverAlertGroup(openGroup.id);
            alertsSent++;
          } else {
            const context: AlertGroupContext = {
              action: normalizedTrade.action,
              outcome: normalizedTrade.outcome,
              price: normalizedTrade.price,
              categoryId: category.id,
            };

            const newAlertGroup = await prisma.alertGroup.create({
              data: {
                tradeId: newTrade.id,
                traderId: trader.id,
                marketId: market.id,
                context: JSON.stringify(context),
                totalSize: new Decimal(normalizedTrade.size),
                avgPrice: new Decimal(normalizedTrade.price),
                tradeCount: 1,
              },
            });

            await deliverAlertGroup(newAlertGroup.id);
            alertsSent++;
          }
        }
      }
    }
  } catch (err) {
    status = "error";
    message = err instanceof Error ? err.message : String(err);
    errorText = message;
    console.error(`[tradeWorker] Cycle error:`, err);
  }

  const durationMs = Date.now() - startTime;

  await prisma.workerLog
    .create({
      data: {
        workerName: "tradeWorker",
        status,
        message,
        durationMs,
        tradersChecked,
        tradesFound,
        alertsSent,
        error: errorText,
      },
    })
    .catch((logErr) => {
      console.error(`[tradeWorker] Failed to write WorkerLog:`, logErr);
    });

  console.log(
    `[tradeWorker] Cycle complete: status=${status} duration=${durationMs}ms`
  );
}

async function tick(): Promise<void> {
  if (isRunning) {
    console.log("[tradeWorker] Previous cycle still running, skipping");
    return;
  }

  isRunning = true;
  try {
    await runCycle();
  } finally {
    isRunning = false;
  }
}

export function start(): void {
  console.log("[tradeWorker] Starting (interval=30s)");
  intervalHandle = setInterval(() => {
    cyclePromise = tick().catch((err) => {
      console.error("[tradeWorker] Unhandled tick error:", err);
      isRunning = false;
    });
  }, currentIntervalMs);
}

export async function stop(): Promise<void> {
  if (intervalHandle !== null) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
  if (cyclePromise) {
    await cyclePromise;
  }
}
