import { prisma } from "../db/client";

export interface CreateCategoryInput {
  slug: string;
  name: string;
  description?: string;
  sourceIdentifier?: string;
  sourceKey?: string;
  parentCategoryId?: number;
  isActive?: boolean;
  isVisibleToUsers?: boolean;
  displayOrder?: number;
}

export type UpdateCategoryInput = Omit<Partial<CreateCategoryInput>, "slug">;

export async function getActiveVisibleCategories() {
  return prisma.category.findMany({
    where: { isActive: true, isVisibleToUsers: true },
    orderBy: { displayOrder: "asc" },
  });
}

export async function getAllCategories() {
  return prisma.category.findMany({
    orderBy: { displayOrder: "asc" },
  });
}

export async function getCategoryBySlug(slug: string) {
  return prisma.category.findUnique({ where: { slug } });
}

export async function getCategoryById(id: number) {
  return prisma.category.findUnique({ where: { id } });
}

export async function createCategory(data: CreateCategoryInput) {
  return prisma.category.create({
    data: {
      slug: data.slug,
      name: data.name,
      description: data.description,
      sourceIdentifier: data.sourceIdentifier,
      sourceKey: data.sourceKey,
      parentCategoryId: data.parentCategoryId,
      isActive: data.isActive ?? true,
      isVisibleToUsers: data.isVisibleToUsers ?? true,
      displayOrder: data.displayOrder ?? 0,
    },
  });
}

export async function updateCategory(id: number, data: UpdateCategoryInput) {
  const existing = await prisma.category.findUnique({ where: { id } });
  if (!existing) {
    throw new Error(`Category with id ${id} not found`);
  }
  return prisma.category.update({ where: { id }, data });
}

export async function toggleCategoryActive(id: number, isActive: boolean) {
  return prisma.category.update({ where: { id }, data: { isActive } });
}

export async function toggleCategoryVisible(id: number, isVisibleToUsers: boolean) {
  return prisma.category.update({ where: { id }, data: { isVisibleToUsers } });
}

export async function reorderCategories(orderedIds: number[]) {
  await prisma.$transaction(
    orderedIds.map((id, index) =>
      prisma.category.update({ where: { id }, data: { displayOrder: index } })
    )
  );
}
