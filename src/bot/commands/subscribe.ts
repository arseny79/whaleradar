import { prisma } from "../../db/client";
import { paymentService } from "../payments/paymentService";
import { getActiveSubscription } from "../../services/subscriptionService";
import { I18nContext } from "../middleware/i18n";

export async function subscribeCommand(ctx: I18nContext) {
  try {
    const telegramId = ctx.from?.id;
    if (!telegramId) return;

    const user = await prisma.user.findUnique({
      where: { telegramId: BigInt(telegramId) },
    });

    if (!user) {
      await ctx.reply(ctx.t("error.generic"));
      return;
    }

    const activeSub = await getActiveSubscription(user.id);
    if (activeSub) {
      const expiryDate = activeSub.endDate.toISOString().split("T")[0];
      await ctx.reply(ctx.t("commands.subscribe.already_pro", { date: expiryDate }));
      return;
    }

    await ctx.reply(ctx.t("commands.subscribe.initiating"));
    await paymentService.sendInvoice(ctx, user.id);
  } catch (err) {
    console.error(`[subscribe] Error for telegramId=${ctx.from?.id}:`, err);
    await ctx.reply(ctx.t("error.generic")).catch(() => {});
  }
}
