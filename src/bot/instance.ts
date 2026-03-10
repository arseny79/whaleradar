import { Telegraf } from "telegraf";
import { I18nContext } from "./middleware/i18n";

let botInstance: Telegraf<I18nContext> | null = null;

export function setBotInstance(bot: Telegraf<I18nContext>): void {
  botInstance = bot;
}

export function getBotInstance(): Telegraf<I18nContext> {
  if (!botInstance) {
    throw new Error("Bot instance not initialized. Call setBotInstance first.");
  }
  return botInstance;
}
