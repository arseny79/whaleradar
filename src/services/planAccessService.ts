import { prisma } from "../db/client";

export interface AccessMatrix {
  plans: Array<{ id: number; name: string; slug: string }>;
  categories: Array<{ id: number; name: string; slug: string }>;
  access: Record<string, string[]>;
}

export async function getMatrix(): Promise<AccessMatrix> {
  const [plans, categories, rows] = await Promise.all([
    prisma.plan.findMany({ orderBy: { price: "asc" } }),
    prisma.category.findMany({ orderBy: { displayOrder: "asc" } }),
    prisma.planCategoryAccess.findMany(),
  ]);

  const access: Record<string, string[]> = {};
  for (const plan of plans) {
    access[String(plan.id)] = [];
  }
  for (const row of rows) {
    const key = String(row.planId);
    if (!access[key]) access[key] = [];
    access[key].push(String(row.categoryId));
  }

  return {
    plans: plans.map((p) => ({ id: p.id, name: p.name, slug: p.slug })),
    categories: categories.map((c) => ({ id: c.id, name: c.name, slug: c.slug })),
    access,
  };
}

export async function replaceAll(matrix: Record<string, string[]>): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.planCategoryAccess.deleteMany();
    const rows: Array<{ planId: number; categoryId: number }> = [];
    for (const [planId, categoryIds] of Object.entries(matrix)) {
      for (const catId of categoryIds) {
        rows.push({ planId: parseInt(planId, 10), categoryId: parseInt(catId, 10) });
      }
    }
    if (rows.length > 0) {
      await tx.planCategoryAccess.createMany({ data: rows });
    }
  });
}
