import { prisma } from "../db/client";

const ROI_API_URL =
  "https://data-api.polymarket.com/v1/leaderboard?category=OVERALL&timePeriod=ALL&orderBy=PNL&limit=1000";

let isRunning = false;
let intervalHandle: ReturnType<typeof setInterval> | null = null;
let cyclePromise: Promise<void> | null = null;

interface LeaderboardEntry {
  proxyWallet: string;
  pnl: number;
  vol: number;
}

async function getIntervalSeconds(): Promise<number> {
  const row = await prisma.appSetting.findUnique({
    where: { key: "roiWorkerIntervalSeconds" },
  });
  return parseInt(row?.value ?? "3600", 10);
}

async function runCycle(): Promise<void> {
  const startTime = Date.now();
  let tradersChecked = 0;
  let errorText: string | null = null;

  try {
    const activeTraders = await prisma.trader.findMany({
      where: { isTracked: true },
    });

    let leaderboard: LeaderboardEntry[];
    try {
      const response = await fetch(ROI_API_URL, {
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) {
        throw new Error(`Leaderboard API returned ${response.status}`);
      }
      leaderboard = (await response.json()) as LeaderboardEntry[];
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[roiWorker] Leaderboard fetch failed: ${msg}`);
      errorText = msg;

      await writeWorkerLog(startTime, tradersChecked, errorText);
      return;
    }

    const roiMap = new Map<string, number>();
    for (const entry of leaderboard) {
      if (!entry.proxyWallet) continue;
      const percentPnl = entry.vol > 0 ? (entry.pnl / entry.vol) * 100 : 0;
      roiMap.set(entry.proxyWallet.toLowerCase(), percentPnl);
    }

    for (const trader of activeTraders) {
      tradersChecked++;
      try {
        const pnl = roiMap.get(trader.walletAddress.toLowerCase());
        if (pnl !== undefined) {
          await prisma.trader.update({
            where: { id: trader.id },
            data: {
              roiPercent: pnl,
              roiUpdatedAt: new Date(),
            },
          });
        }
      } catch (err) {
        console.warn(
          `[roiWorker] Error updating trader ${trader.id}: ${err instanceof Error ? err.message : err}`
        );
      }
    }
  } catch (err) {
    errorText = err instanceof Error ? err.message : String(err);
    console.error(`[roiWorker] Cycle error:`, err);
  }

  await writeWorkerLog(startTime, tradersChecked, errorText);
}

async function writeWorkerLog(
  startTime: number,
  tradersChecked: number,
  error: string | null
): Promise<void> {
  const durationMs = Date.now() - startTime;
  const status = error ? "error" : "success";

  await prisma.workerLog
    .create({
      data: {
        workerName: "roiWorker",
        status,
        message: error,
        durationMs,
        tradersChecked,
        tradesFound: 0,
        alertsSent: 0,
        error,
      },
    })
    .catch((logErr) => {
      console.error(`[roiWorker] Failed to write WorkerLog:`, logErr);
    });

  console.log(
    `[roiWorker] Cycle complete: status=${status} tradersChecked=${tradersChecked} duration=${durationMs}ms`
  );
}

async function tick(): Promise<void> {
  if (isRunning) {
    console.log("[roiWorker] Previous cycle still running, skipping");
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
  getIntervalSeconds()
    .then((seconds) => {
      console.log(`[roiWorker] Starting (interval=${seconds}s)`);

      cyclePromise = tick().catch((err) => {
        console.error("[roiWorker] Unhandled tick error:", err);
        isRunning = false;
      });

      intervalHandle = setInterval(() => {
        cyclePromise = tick().catch((err) => {
          console.error("[roiWorker] Unhandled tick error:", err);
          isRunning = false;
        });
      }, seconds * 1000);
    })
    .catch((err) => {
      console.error("[roiWorker] Failed to read interval setting:", err);
    });
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
