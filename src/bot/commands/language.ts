import { prisma } from "../../db/client";
import { SupportedLang, t, invalidateLangCache } from "../../i18n";
import { I18nContext } from "../middleware/i18n";

const LANGUAGE_CODES: SupportedLang[] = ["en", "ru", "lv"];

function buildLanguageKeyboard(currentLang: SupportedLang) {
  return {
    inline_keyboard: LANGUAGE_CODES.map((code) => [
      {
        text: (code === currentLang ? "✅ " : "") + t(`commands.language.${code}`, currentLang),
        callback_data: `lang:${code}`,
      },
    ]),
  };
}

export async function languageCommand(ctx: I18nContext) {
  try {
    const telegramId = ctx.from?.id;
    if (!telegramId) return;

    const user = await prisma.user.findUnique({
      where: { telegramId: BigInt(telegramId) },
    });

    const currentLang = (user?.languageCode || "en") as SupportedLang;

    await ctx.reply(ctx.t("commands.language.prompt"), {
      reply_markup: buildLanguageKeyboard(currentLang),
    });
  } catch (err) {
    console.error(`[language] Error for telegramId=${ctx.from?.id}:`, err);
    await ctx.reply(ctx.t("error.generic")).catch(() => {});
  }
}

export async function langCallback(ctx: I18nContext) {
  try {
    await ctx.answerCbQuery();
    const data = (ctx.callbackQuery as any)?.data as string;
    const newLang = data.replace("lang:", "") as SupportedLang;
    const telegramId = ctx.from?.id;
    if (!telegramId) return;

    const user = await prisma.user.findUnique({
      where: { telegramId: BigInt(telegramId) },
    });
    if (!user) return;

    const currentLang = user.languageCode as SupportedLang;

    if (currentLang === newLang) {
      await ctx.editMessageText(t("commands.language.already_set", newLang));
      return;
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { languageCode: newLang },
    });

    invalidateLangCache(telegramId.toString());

    await ctx.editMessageText(t("commands.language.changed", newLang));
  } catch (err) {
    console.error(`[lang] Error for telegramId=${ctx.from?.id}:`, err);
  }
}
