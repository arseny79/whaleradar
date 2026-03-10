import { Telegraf } from "telegraf";
import { i18nMiddleware, I18nContext } from "./middleware/i18n";
import { startCommand } from "./commands/start";
import { helpCommand } from "./commands/help";
import { pricingCommand } from "./commands/pricing";
import { subscribeCommand } from "./commands/subscribe";
import {
  categoriesCommand,
  selectCategoryCallback,
  categoryPageCallback,
  categoriesDoneCallback,
} from "./commands/categories";
import { languageCommand, langCallback } from "./commands/language";
import {
  handlePreCheckoutQuery,
  handleSuccessfulPayment,
} from "./payments/paymentHandlers";

export function registerBot(bot: Telegraf<I18nContext>) {
  bot.use(i18nMiddleware);

  bot.command("start", (ctx) => startCommand(ctx));
  bot.command("help", (ctx) => helpCommand(ctx));
  bot.command("pricing", (ctx) => pricingCommand(ctx));
  bot.command("subscribe", (ctx) => subscribeCommand(ctx));
  bot.command("categories", (ctx) => categoriesCommand(ctx));
  bot.command("language", (ctx) => languageCommand(ctx));

  bot.action(/^select_category:/, (ctx) => selectCategoryCallback(ctx));
  bot.action(/^category_page:/, (ctx) => categoryPageCallback(ctx));
  bot.action("categories_done", (ctx) => categoriesDoneCallback(ctx));
  bot.action(/^lang:/, (ctx) => langCallback(ctx));
  bot.action("subscribe_pro", (ctx) => subscribeCommand(ctx));

  bot.on("pre_checkout_query", (ctx) => handlePreCheckoutQuery(ctx));
  bot.on("message", (ctx, next) => {
    if (ctx.message && "successful_payment" in ctx.message) {
      return handleSuccessfulPayment(ctx);
    }
    return next();
  });
}
