import { prisma } from "../db/client";
import { getBotInstance } from "../bot/instance";
import { computeContextLabel } from "./contextEngine";
import { formatAlertMessage } from "./alertFormatter";
import { SupportedLang } from "../i18n";

interface AlertGroupContext {
  action: string;
  outcome: string;
  price: number;
  categoryId: number;
}

const BATCH_SIZE = 25;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function deliverAlertGroup(alertGroupId: number): Promise<void> {
  const alertGroup = await prisma.alertGroup.findUnique({
    where: { id: alertGroupId },
  });

  if (!alertGroup) {
    console.warn(
      `[alertDelivery] AlertGroup ${alertGroupId} not found, skipping`
    );
    return;
  }

  const context: AlertGroupContext = JSON.parse(alertGroup.context);
  const categoryId = context.categoryId;

  const [trader, market] = await Promise.all([
    prisma.trader.findUnique({ where: { id: alertGroup.traderId } }),
    prisma.market.findUnique({ where: { id: alertGroup.marketId } }),
  ]);

  if (!trader || !market) {
    console.warn(
      `[alertDelivery] Trader or Market not found for AlertGroup ${alertGroupId}, skipping`
    );
    return;
  }

  const [freeAlertQuotaSetting, batchDelaySetting] = await Promise.all([
    prisma.appSetting.findUnique({ where: { key: "free_alert_quota" } }),
    prisma.appSetting.findUnique({ where: { key: "telegramBatchDelayMs" } }),
  ]);
  const freeAlertQuota = parseInt(freeAlertQuotaSetting?.value ?? "10", 10);
  const batchDelayMs = parseInt(batchDelaySetting?.value ?? "1000", 10);

  const everythingCategory = await prisma.category.findUnique({
    where: { slug: "everything" },
  });
  const everythingId = everythingCategory?.id;

  const plansWithAccess = await prisma.planCategoryAccess.findMany({
    where: { categoryId },
    include: { plan: true },
  });
  const planSlugsWithAccess = plansWithAccess.map((p) => p.plan.slug);

  const hasFreePlanAccess =
    planSlugsWithAccess.includes("free") || plansWithAccess.length === 0;
  const hasProPlanAccess =
    planSlugsWithAccess.includes("pro") || plansWithAccess.length === 0;

  const categoryPreferenceFilter: Array<{
    categoryPreferences: { some: { categoryId: number } };
  }> = [{ categoryPreferences: { some: { categoryId } } }];
  if (everythingId) {
    categoryPreferenceFilter.push({
      categoryPreferences: { some: { categoryId: everythingId } },
    });
  }

  const planFilter: Array<Record<string, unknown>> = [];
  if (hasFreePlanAccess) {
    planFilter.push({ isSubscribed: false });
  }
  if (hasProPlanAccess) {
    planFilter.push({ isSubscribed: true });
  }

  if (planFilter.length === 0) return;

  const eligibleUsers = await prisma.user.findMany({
    where: {
      AND: [
        { OR: categoryPreferenceFilter },
        { OR: planFilter },
      ],
    },
  });

  const bot = getBotInstance();
  const label = await computeContextLabel(alertGroup);

  for (let batchStart = 0; batchStart < eligibleUsers.length; batchStart += BATCH_SIZE) {
    if (batchStart > 0) {
      await delay(batchDelayMs);
    }

    const batch = eligibleUsers.slice(batchStart, batchStart + BATCH_SIZE);

    for (const user of batch) {
      const lang = (user.languageCode as SupportedLang) || "en";
      const message = formatAlertMessage(alertGroup, trader, market, label, lang);
      const existingDelivery = await prisma.userAlertDelivery.findUnique({
        where: {
          userId_alertGroupId: {
            userId: user.id,
            alertGroupId: alertGroup.id,
          },
        },
      });

      if (existingDelivery) continue;

      const isProActive =
        user.isSubscribed &&
        (user.subscriptionExpiresAt === null ||
          user.subscriptionExpiresAt > new Date());

      if (!isProActive) {
        const deliveredCount = await prisma.userAlertDelivery.count({
          where: {
            userId: user.id,
            status: "delivered",
          },
        });

        if (deliveredCount >= freeAlertQuota) {
          await prisma.userAlertDelivery.create({
            data: {
              userId: user.id,
              alertGroupId: alertGroup.id,
              status: "quota_exceeded",
            },
          });
          continue;
        }
      }

      try {
        await bot.telegram.sendMessage(
          user.telegramId.toString(),
          message,
          { parse_mode: "MarkdownV2" }
        );

        await prisma.userAlertDelivery.create({
          data: {
            userId: user.id,
            alertGroupId: alertGroup.id,
            status: "delivered",
            sentAt: new Date(),
          },
        });
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : String(err);

        await prisma.userAlertDelivery.create({
          data: {
            userId: user.id,
            alertGroupId: alertGroup.id,
            status: "failed",
            errorMessage,
          },
        });
        continue;
      }
    }
  }
}
