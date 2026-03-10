import { Context } from "telegraf";
import { prisma } from "../../db/client";
import { detectLanguage } from "./languageDetect";

export async function upsertUser(ctx: Context) {
  const from = ctx.from;
  if (!from) {
    throw new Error("ctx.from is undefined");
  }

  const telegramId = BigInt(from.id);
  const languageCode = detectLanguage(from.language_code);

  const user = await prisma.user.upsert({
    where: { telegramId },
    update: {
      username: from.username || null,
      firstName: from.first_name,
      languageCode,
    },
    create: {
      telegramId,
      username: from.username || null,
      firstName: from.first_name,
      languageCode,
    },
  });

  return user;
}
