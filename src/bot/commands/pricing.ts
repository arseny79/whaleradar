import { prisma } from "../../db/client";
import { I18nContext } from "../middleware/i18n";

export async function pricingCommand(ctx: I18nContext) {
  try {
    const telegramId = ctx.from?.id;
    let freeAlertsUsed = 0;

    if (telegramId) {
      const user = await prisma.user.findUnique({
        where: { telegramId: BigInt(telegramId) },
      });
      if (user) {
        freeAlertsUsed = user.freeAlertsUsed;
      }
    }

    const plans = await prisma.plan.findMany({
      where: { isActive: true },
      orderBy: { price: "asc" },
      include: {
        categoryAccess: {
          include: { category: true },
        },
      },
    });

    let message = ctx.t("commands.pricing.title") + "\n\n";

    for (const plan of plans) {
      message += ctx.t("commands.pricing.plan_name", { name: plan.name }) + "\n";

      if (plan.price === 0) {
        message += ctx.t("commands.pricing.price_free") + "\n";
      } else {
        const displayPrice = (plan.price / 100).toFixed(2);
        const period = plan.billingPeriodDays ? `${plan.billingPeriodDays}d` : "";
        message += ctx.t("commands.pricing.price_paid", { price: displayPrice, period }) + "\n";
      }

      if (plan.alertQuota !== null && plan.alertQuota > 0) {
        const remaining = Math.max(0, plan.alertQuota - freeAlertsUsed);
        message += ctx.t("commands.pricing.free_remaining", { count: remaining }) + "\n";
      } else if (plan.alertQuota === null && plan.price > 0) {
        message += ctx.t("commands.pricing.unlimited_alerts") + "\n";
      }

      if (plan.categoryAccess.length > 0) {
        const catNames = plan.categoryAccess.map((a) => a.category.name).join(", ");
        message += ctx.t("commands.pricing.categories_list", { categories: catNames }) + "\n";
      } else {
        message += ctx.t("commands.pricing.categories_all") + "\n";
      }

      message += "\n";
    }

    const proPlan = plans.find((p) => p.slug === "pro");
    if (proPlan) {
      await ctx.reply(message, {
        reply_markup: {
          inline_keyboard: [
            [{ text: ctx.t("commands.pricing.subscribe_button"), callback_data: "subscribe_pro" }],
          ],
        },
      });
    } else {
      await ctx.reply(message);
    }
  } catch (err) {
    console.error(`[pricing] Error for telegramId=${ctx.from?.id}:`, err);
    await ctx.reply(ctx.t("error.generic")).catch(() => {});
  }
}
