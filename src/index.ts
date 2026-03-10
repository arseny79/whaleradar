import { config } from "./config";
import { prisma } from "./db/client";
import { Telegraf } from "telegraf";
import express from "express";
import adminRouter from "./admin";
import { registerBot } from "./bot";
import { setBotInstance } from "./bot/instance";
import { startWorkers } from "./workers";
import { I18nContext } from "./bot/middleware/i18n";

const PORT = parseInt(process.env.PORT || "3000", 10);

async function main() {
  await prisma.$connect();
  console.log("[DB] Connected");

  const bot = new Telegraf<I18nContext>(config.telegramBotToken);
  setBotInstance(bot);
  registerBot(bot);

  bot.launch().catch((err: Error) => {
    console.warn("[Bot] Polling error (check TELEGRAM_BOT_TOKEN):", err.message);
  });
  console.log("[Bot] Polling started");

  const app = express();
  app.use(express.urlencoded({ extended: true }));
  app.use(express.json());

  app.get("/", (_req, res) => {
    res.send("WhaleRadar is running");
  });

  app.use("/admin", adminRouter);

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[HTTP] Listening on port ${PORT}`);
  });

  startWorkers();
}

main().catch((err) => {
  console.error("Startup failed:", err);
  process.exit(1);
});
