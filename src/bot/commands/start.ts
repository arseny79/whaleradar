import { I18nContext } from "../middleware/i18n";
import { upsertUser } from "../utils/upsertUser";
import { getActiveVisibleCategories } from "../../services/categoryService";
import { buildCategoryKeyboard } from "../keyboards/categoryKeyboard";
import { prisma } from "../../db/client";

export async function startCommand(ctx: I18nContext) {
  try {
    await upsertUser(ctx);

    await ctx.reply(
      `${ctx.t("commands.start.welcome_title")}\n\n${ctx.t("commands.start.welcome_description")}\n\n${ctx.t("commands.start.language_detected")}`
    );

    const categories = await getActiveVisibleCategories();
    if (categories.length === 0) {
      await ctx.reply(ctx.t("commands.categories.none_available"));
      return;
    }

    await ctx.reply(ctx.t("commands.categories.select_prompt"), {
      reply_markup: buildCategoryKeyboard(categories),
    });

    const plan = await prisma.plan.findUnique({ where: { slug: "free" } });
    const freeCount = plan?.alertQuota ?? 10;

    await ctx.reply(
      ctx.t("commands.start.quota_explanation", { count: freeCount })
    );
  } catch (err) {
    console.error(`[start] Error for telegramId=${ctx.from?.id}:`, err);
    await ctx.reply(ctx.t("error.generic")).catch(() => {});
  }
}
