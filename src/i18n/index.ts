import enStrings from "./en.json";
import ruStrings from "./ru.json";
import lvStrings from "./lv.json";

export type SupportedLang = "en" | "ru" | "lv";

const SUPPORTED_LANGS: SupportedLang[] = ["en", "ru", "lv"];

const dictionaries: Record<SupportedLang, Record<string, string>> = {
  en: enStrings as Record<string, string>,
  ru: ruStrings as Record<string, string>,
  lv: lvStrings as Record<string, string>,
};

export function isSupportedLang(code: string): code is SupportedLang {
  return (SUPPORTED_LANGS as readonly string[]).includes(code);
}

export function t(
  key: string,
  lang: SupportedLang,
  params?: Record<string, string | number>
): string {
  let text = dictionaries[lang]?.[key] ?? dictionaries.en[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.split(`{{${k}}}`).join(String(v));
    }
  }
  return text;
}

const langCache = new Map<string, { lang: SupportedLang; cachedAt: number }>();

export function invalidateLangCache(telegramId: string): void {
  langCache.delete(telegramId);
}

export function getCachedLang(telegramId: string): SupportedLang | null {
  const entry = langCache.get(telegramId);
  if (!entry) return null;
  if (Date.now() - entry.cachedAt > 5 * 60 * 1000) {
    langCache.delete(telegramId);
    return null;
  }
  return entry.lang;
}

export function setCachedLang(telegramId: string, lang: SupportedLang): void {
  langCache.set(telegramId, { lang, cachedAt: Date.now() });
}
