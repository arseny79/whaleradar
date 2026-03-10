import { I18nContext } from "../middleware/i18n";

export async function helpCommand(ctx: I18nContext) {
  try {
    const message = [
      ctx.t("commands.help.title"),
      "",
      ctx.t("commands.help.start"),
      ctx.t("commands.help.help"),
      ctx.t("commands.help.pricing"),
      ctx.t("commands.help.subscribe"),
      ctx.t("commands.help.categories"),
      ctx.t("commands.help.language"),
    ].join("\n");

    await ctx.reply(message);
  } catch (err) {
    console.error(`[help] Error for telegramId=${ctx.from?.id}:`, err);
    await ctx.reply(ctx.t("error.generic")).catch(() => {});
  }
}
