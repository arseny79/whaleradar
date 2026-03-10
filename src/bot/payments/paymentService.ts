import { prisma } from "../../db/client";
import { config } from "../../config";
import { I18nContext } from "../middleware/i18n";

export class PaymentService {
  async sendInvoice(ctx: I18nContext, userId: number): Promise<void> {
    try {
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) {
        console.error(`[PaymentService] User ${userId} not found`);
        await ctx.reply(ctx.t("error.generic")).catch(() => {});
        return;
      }

      const proPlan = await prisma.plan.findFirst({
        where: { slug: "pro", isActive: true },
      });

      if (!proPlan) {
        console.error("[PaymentService] Active Pro plan not found");
        await ctx.reply(ctx.t("error.generic")).catch(() => {});
        return;
      }

      const payload = JSON.stringify({
        planId: proPlan.id,
        userId: user.id,
      });

      const chatId = ctx.chat?.id;
      if (!chatId) {
        console.error(`[PaymentService] No chat id for userId=${userId}`);
        return;
      }

      const days = proPlan.billingPeriodDays ?? 30;
      const description = ctx.t("payments.invoice_description", {
        planName: proPlan.name,
        days,
      });

      await ctx.telegram.sendInvoice(chatId, {
        title: proPlan.name,
        description,
        payload,
        provider_token: config.telegramPaymentProviderToken,
        currency: proPlan.currency,
        prices: [
          {
            label: proPlan.name,
            amount: proPlan.price,
          },
        ],
      });
    } catch (err) {
      console.error(`[PaymentService] sendInvoice error for userId=${userId}:`, err);
      await ctx.reply(ctx.t("error.generic")).catch(() => {});
    }
  }
}

export const paymentService = new PaymentService();
