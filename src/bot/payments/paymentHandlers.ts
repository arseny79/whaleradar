import { prisma } from "../../db/client";
import { SupportedLang, t } from "../../i18n";
import { I18nContext } from "../middleware/i18n";

interface InvoicePayload {
  planId: number;
  userId: number;
}

export async function handlePreCheckoutQuery(ctx: I18nContext): Promise<void> {
  const query = ctx.preCheckoutQuery;
  if (!query) return;

  try {
    const payload: InvoicePayload = JSON.parse(query.invoice_payload);

    const [plan, user] = await Promise.all([
      prisma.plan.findUnique({ where: { id: payload.planId } }),
      prisma.user.findUnique({ where: { id: payload.userId } }),
    ]);

    if (!plan || !plan.isActive) {
      const lang = user?.languageCode as SupportedLang | undefined;
      await ctx.answerPreCheckoutQuery(false, t("payments.plan_unavailable", lang ?? "en"));
      return;
    }

    if (!user) {
      await ctx.answerPreCheckoutQuery(false, t("payments.user_not_found", "en"));
      return;
    }

    await ctx.answerPreCheckoutQuery(true);
  } catch (err) {
    console.error("[preCheckout] Error:", err);
    await ctx.answerPreCheckoutQuery(false, t("payments.validation_error", "en")).catch(() => {});
  }
}

export async function handleSuccessfulPayment(ctx: I18nContext): Promise<void> {
  const payment = ctx.message && "successful_payment" in ctx.message
    ? ctx.message.successful_payment
    : null;

  if (!payment) return;

  const telegramChargeId = payment.telegram_payment_charge_id;

  try {
    const payload: InvoicePayload = JSON.parse(payment.invoice_payload);

    const plan = await prisma.plan.findUnique({ where: { id: payload.planId } });
    if (!plan) {
      console.error(`[successfulPayment] Plan ${payload.planId} not found, telegramChargeId=${telegramChargeId}`);
      return;
    }

    const user = await prisma.user.findUnique({ where: { id: payload.userId } });
    if (!user) {
      console.error(`[successfulPayment] User ${payload.userId} not found, telegramChargeId=${telegramChargeId}`);
      return;
    }

    const lang = user.languageCode as SupportedLang;
    const now = new Date();
    const billingDays = plan.billingPeriodDays ?? 30;
    const endDate = new Date(now.getTime() + billingDays * 24 * 60 * 60 * 1000);

    try {
      await prisma.payment.create({
        data: {
          userId: user.id,
          planId: plan.id,
          amount: plan.price,
          currency: payment.currency,
          provider: "telegram",
          telegramPaymentChargeId: telegramChargeId,
          providerChargeId: payment.provider_payment_charge_id,
          status: "completed",
          paidAt: now,
          expiresAt: endDate,
        },
      });

      await prisma.userSubscription.create({
        data: {
          userId: user.id,
          planId: plan.id,
          status: "active",
          startDate: now,
          endDate,
        },
      });

      await prisma.user.update({
        where: { id: user.id },
        data: {
          isSubscribed: true,
          subscriptionExpiresAt: endDate,
        },
      });

      const expiryDate = endDate.toISOString().split("T")[0];
      await ctx.reply(
        t("payments.success", lang, { planName: plan.name, endDate: expiryDate })
      );
    } catch (dbErr) {
      console.error(
        `[successfulPayment] DB error, telegramChargeId=${telegramChargeId}:`,
        dbErr
      );
    }
  } catch (err) {
    console.error(
      `[successfulPayment] Error processing payment, telegramChargeId=${telegramChargeId}:`,
      err
    );
  }
}
