import { prisma } from "../../db/client";
import { SupportedLang, t } from "../../i18n";
import { getActiveVisibleCategories } from "../../services/categoryService";
import { Category } from "@prisma/client";
import { I18nContext } from "../middleware/i18n";

const PAGE_SIZE = 7;
const MAX_NO_PAGINATION = 8;

function buildSelectableCategoryKeyboard(
  categories: Category[],
  selectedSlugs: Set<string>,
  lang: SupportedLang,
  page: number = 0
) {
  const needsPagination = categories.length > MAX_NO_PAGINATION;
  const pageSize = needsPagination ? PAGE_SIZE : categories.length;
  const start = needsPagination ? page * pageSize : 0;
  const pageCategories = categories.slice(start, start + pageSize);
  const totalPages = needsPagination ? Math.ceil(categories.length / PAGE_SIZE) : 1;

  const rows = pageCategories.map((cat) => [
    {
      text: (selectedSlugs.has(cat.slug) ? "✅ " : "") + cat.name,
      callback_data: `select_category:${cat.slug}`,
    },
  ]);

  if (needsPagination) {
    const navRow: Array<{ text: string; callback_data: string }> = [];
    if (page > 0) {
      navRow.push({ text: t("commands.categories.keyboard_back", lang), callback_data: `category_page:${page - 1}` });
    }
    if (page < totalPages - 1) {
      navRow.push({ text: t("commands.categories.keyboard_next", lang), callback_data: `category_page:${page + 1}` });
    }
    if (navRow.length > 0) {
      rows.push(navRow);
    }
  }

  rows.push([{ text: t("commands.categories.done_button", lang), callback_data: "categories_done" }]);

  return { inline_keyboard: rows };
}

async function getUserSelectedSlugs(userId: number): Promise<Set<string>> {
  const prefs = await prisma.userCategoryPreference.findMany({
    where: { userId },
    include: { category: true },
  });
  return new Set(prefs.map((p) => p.category.slug));
}

export async function categoriesCommand(ctx: I18nContext) {
  try {
    const telegramId = ctx.from?.id;
    if (!telegramId) return;

    const user = await prisma.user.findUnique({
      where: { telegramId: BigInt(telegramId) },
    });

    if (!user) {
      await ctx.reply(ctx.t("error.generic"));
      return;
    }

    const lang = user.languageCode as SupportedLang;
    const categories = await getActiveVisibleCategories();

    if (categories.length === 0) {
      await ctx.reply(ctx.t("commands.categories.none_available"));
      return;
    }

    const selectedSlugs = await getUserSelectedSlugs(user.id);

    await ctx.reply(ctx.t("commands.categories.select_prompt"), {
      reply_markup: buildSelectableCategoryKeyboard(categories, selectedSlugs, lang),
    });
  } catch (err) {
    console.error(`[categories] Error for telegramId=${ctx.from?.id}:`, err);
    await ctx.reply(ctx.t("error.generic")).catch(() => {});
  }
}

export async function selectCategoryCallback(ctx: I18nContext) {
  try {
    await ctx.answerCbQuery();
    const data = (ctx.callbackQuery as any)?.data as string;
    const slug = data.replace("select_category:", "");
    const telegramId = ctx.from?.id;
    if (!telegramId) return;

    const user = await prisma.user.findUnique({
      where: { telegramId: BigInt(telegramId) },
    });
    if (!user) return;

    const lang = user.languageCode as SupportedLang;

    const category = await prisma.category.findUnique({ where: { slug } });
    if (!category) return;

    const existing = await prisma.userCategoryPreference.findUnique({
      where: { userId_categoryId: { userId: user.id, categoryId: category.id } },
    });

    if (existing) {
      await prisma.userCategoryPreference.delete({
        where: { id: existing.id },
      });
    } else {
      await prisma.userCategoryPreference.create({
        data: { userId: user.id, categoryId: category.id },
      });
    }

    const categories = await getActiveVisibleCategories();
    const selectedSlugs = await getUserSelectedSlugs(user.id);

    await ctx.editMessageReplyMarkup(
      buildSelectableCategoryKeyboard(categories, selectedSlugs, lang)
    );
  } catch (err) {
    console.error(`[select_category] Error for telegramId=${ctx.from?.id}:`, err);
  }
}

export async function categoryPageCallback(ctx: I18nContext) {
  try {
    await ctx.answerCbQuery();
    const data = (ctx.callbackQuery as any)?.data as string;
    const page = parseInt(data.replace("category_page:", ""), 10);
    const telegramId = ctx.from?.id;
    if (!telegramId) return;

    const user = await prisma.user.findUnique({
      where: { telegramId: BigInt(telegramId) },
    });
    if (!user) return;

    const lang = user.languageCode as SupportedLang;
    const categories = await getActiveVisibleCategories();
    const selectedSlugs = await getUserSelectedSlugs(user.id);

    await ctx.editMessageReplyMarkup(
      buildSelectableCategoryKeyboard(categories, selectedSlugs, lang, page)
    );
  } catch (err) {
    console.error(`[category_page] Error for telegramId=${ctx.from?.id}:`, err);
  }
}

export async function categoriesDoneCallback(ctx: I18nContext) {
  try {
    await ctx.answerCbQuery();
    const telegramId = ctx.from?.id;
    if (!telegramId) return;

    const user = await prisma.user.findUnique({
      where: { telegramId: BigInt(telegramId) },
    });
    if (!user) return;

    const prefs = await prisma.userCategoryPreference.findMany({
      where: { userId: user.id },
      include: { category: true },
    });

    if (prefs.length === 0) {
      await ctx.answerCbQuery(ctx.t("commands.categories.select_at_least_one"));
      return;
    }

    const categoryNames = prefs.map((p) => p.category.name).join(", ");
    await ctx.editMessageText(
      ctx.t("commands.categories.updated", { categories: categoryNames })
    );
  } catch (err) {
    console.error(`[categories_done] Error for telegramId=${ctx.from?.id}:`, err);
  }
}
