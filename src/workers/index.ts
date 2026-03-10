import * as tradeWorker from "./tradeWorker";
import * as roiWorker from "./roiWorker";

const HARD_TIMEOUT_MS = 30_000;

export function startWorkers(): void {
  tradeWorker.start();
  roiWorker.start();
}

async function gracefulShutdown(signal: string): Promise<void> {
  console.log(`[workers] Received ${signal}, stopping workers...`);

  const hardTimer = setTimeout(() => {
    console.log("[workers] Hard timeout reached, forcing exit");
    process.exit(0);
  }, HARD_TIMEOUT_MS);
  hardTimer.unref();

  try {
    await Promise.all([tradeWorker.stop(), roiWorker.stop()]);
    console.log("[workers] All workers stopped gracefully");
  } catch (err) {
    console.error("[workers] Error during shutdown:", err);
  }

  process.exit(0);
}

process.once("SIGTERM", () => {
  gracefulShutdown("SIGTERM").catch(() => process.exit(0));
});
process.once("SIGINT", () => {
  gracefulShutdown("SIGINT").catch(() => process.exit(0));
});
