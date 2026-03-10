import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  TELEGRAM_BOT_TOKEN: z.string().min(1, "TELEGRAM_BOT_TOKEN is required"),
  TELEGRAM_PROVIDER_TOKEN: z.string().min(1, "TELEGRAM_PROVIDER_TOKEN is required"),
  TELEGRAM_PAYMENT_PROVIDER_TOKEN: z.string().min(1, "TELEGRAM_PAYMENT_PROVIDER_TOKEN is required"),
  POLYMARKET_API_BASE_URL: z.string().min(1, "POLYMARKET_API_BASE_URL is required"),
  ADMIN_USERNAME: z.string().min(1, "ADMIN_USERNAME is required"),
  ADMIN_PASSWORD: z.string().min(1, "ADMIN_PASSWORD is required"),
  APP_BASE_URL: z.string().min(1, "APP_BASE_URL is required"),
  NODE_ENV: z.string().default("development"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const formatted = parsed.error.issues
    .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
    .join("\n");
  console.error(`Environment validation failed:\n${formatted}`);
  process.exit(1);
}

export const config = {
  databaseUrl: parsed.data.DATABASE_URL,
  telegramBotToken: parsed.data.TELEGRAM_BOT_TOKEN,
  telegramProviderToken: parsed.data.TELEGRAM_PROVIDER_TOKEN,
  telegramPaymentProviderToken: parsed.data.TELEGRAM_PAYMENT_PROVIDER_TOKEN,
  polymarketApiBaseUrl: parsed.data.POLYMARKET_API_BASE_URL,
  adminUsername: parsed.data.ADMIN_USERNAME,
  adminPassword: parsed.data.ADMIN_PASSWORD,
  appBaseUrl: parsed.data.APP_BASE_URL,
  nodeEnv: parsed.data.NODE_ENV,
};
