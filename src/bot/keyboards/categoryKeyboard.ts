import { Category } from "@prisma/client";

interface InlineKeyboardButton {
  text: string;
  callback_data: string;
}

interface InlineKeyboardMarkup {
  inline_keyboard: InlineKeyboardButton[][];
}

const PAGE_SIZE = 7;
const MAX_NO_PAGINATION = 8;

export function buildCategoryKeyboard(
  categories: Category[],
  page: number = 0
): InlineKeyboardMarkup {
  if (categories.length <= MAX_NO_PAGINATION) {
    return {
      inline_keyboard: categories.map((cat) => [
        { text: cat.name, callback_data: `select_category:${cat.slug}` },
      ]),
    };
  }

  const totalPages = Math.ceil(categories.length / PAGE_SIZE);
  const start = page * PAGE_SIZE;
  const pageCategories = categories.slice(start, start + PAGE_SIZE);

  const rows: InlineKeyboardButton[][] = pageCategories.map((cat) => [
    { text: cat.name, callback_data: `select_category:${cat.slug}` },
  ]);

  const navRow: InlineKeyboardButton[] = [];
  if (page > 0) {
    navRow.push({ text: "Back", callback_data: `category_page:${page - 1}` });
  }
  if (page < totalPages - 1) {
    navRow.push({ text: "Next", callback_data: `category_page:${page + 1}` });
  }
  if (navRow.length > 0) {
    rows.push(navRow);
  }

  return { inline_keyboard: rows };
}
