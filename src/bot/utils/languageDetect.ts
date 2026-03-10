const SUPPORTED_LANGUAGES = ["en", "ru", "lv"] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

const LANGUAGE_MAP: Record<string, SupportedLanguage> = {
  en: "en",
  ru: "ru",
  lv: "lv",
};

export function detectLanguage(languageCode?: string): SupportedLanguage {
  if (!languageCode) return "en";
  const normalized = languageCode.toLowerCase().split("-")[0];
  return LANGUAGE_MAP[normalized] || "en";
}
