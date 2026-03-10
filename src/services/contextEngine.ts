import { AlertGroup } from "@prisma/client";
import { prisma } from "../db/client";

export type ContextLabel =
  | "First entry"
  | "Second buy today"
  | "Scaling position"
  | "Adding to position"
  | "Reducing position"
  | "Exiting position";

interface AlertGroupContext {
  action: string;
  outcome: string;
  price: number;
  categoryId: number;
}

function getUtcDayStart(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
}

function parseContext(contextStr: string): AlertGroupContext {
  return JSON.parse(contextStr) as AlertGroupContext;
}

export async function computeContextLabel(
  alertGroup: AlertGroup
): Promise<ContextLabel> {
  const currentContext = parseContext(alertGroup.context);
  const currentAction = currentContext.action.toLowerCase();

  const priorGroups = await prisma.alertGroup.findMany({
    where: {
      traderId: alertGroup.traderId,
      marketId: alertGroup.marketId,
      createdAt: { lt: alertGroup.createdAt },
    },
    orderBy: { createdAt: "asc" },
  });

  if (priorGroups.length === 0) {
    return "First entry";
  }

  const priorBuys = priorGroups.filter((g) => {
    const ctx = parseContext(g.context);
    return ctx.action.toLowerCase() === "buy";
  });

  if (currentAction === "buy") {
    const todayStart = getUtcDayStart(alertGroup.createdAt);
    const todayBuys = priorBuys.filter((g) => g.createdAt >= todayStart);

    if (todayBuys.length === 1) {
      return "Second buy today";
    }

    if (todayBuys.length >= 2) {
      return "Scaling position";
    }

    if (priorBuys.length > 0) {
      return "Adding to position";
    }
  }

  if (currentAction === "sell") {
    if (priorBuys.length > 0) {
      return "Reducing position";
    }
    return "Exiting position";
  }

  return "First entry";
}
