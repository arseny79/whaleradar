import { Context, MiddlewareFn } from "telegraf";
import { prisma } from "../../db/client";
import {
  SupportedLang,
  isSupportedLang,
  t,
  getCachedLang,
  setCachedLang,
} from "../../i18n";

export interface I18nContext extends Context {
  t(key: string, params?: Record<string, string | number>): string;
}

export const i18nMiddleware: MiddlewareFn<I18nContext> = async (ctx, next) => {
  const telegramId = ctx.from?.id?.toString();
  let lang: SupportedLang = "en";

  if (telegramId) {
    const cached = getCachedLang(telegramId);
    if (cached) {
      lang = cached;
    } else {
      const user = await prisma.user.findUnique({
        where: { telegramId: BigInt(telegramId) },
        select: { languageCode: true },
      });

      if (user && isSupportedLang(user.languageCode)) {
        lang = user.languageCode;
      } else {
        const rawLang = ctx.from?.language_code;
        if (rawLang) {
          const primary = rawLang.split("-")[0].toLowerCase();
          if (isSupportedLang(primary)) {
            lang = primary;
          }
        }
      }

      setCachedLang(telegramId, lang);
    }
  }

  ctx.t = (key: string, params?: Record<string, string | number>) =>
    t(key, lang, params);

  return next();
};
