import { prisma } from "../db/client";

export async function listTraders(page: number, perPage: number) {
  const skip = (page - 1) * perPage;
  const [traders, total] = await Promise.all([
    prisma.trader.findMany({
      orderBy: { createdAt: "desc" },
      skip,
      take: perPage,
      include: { category: true },
    }),
    prisma.trader.count(),
  ]);
  return { traders, total, page, perPage, totalPages: Math.ceil(total / perPage) };
}

export async function toggleActive(id: number): Promise<boolean> {
  const trader = await prisma.trader.findUnique({ where: { id } });
  if (!trader) return false;
  await prisma.trader.update({
    where: { id },
    data: { isTracked: !trader.isTracked },
  });
  return true;
}

export async function updateAlias(id: number, alias: string): Promise<boolean> {
  const trader = await prisma.trader.findUnique({ where: { id } });
  if (!trader) return false;
  await prisma.trader.update({
    where: { id },
    data: { aliasOverride: alias.trim() || null },
  });
  return true;
}

export async function getTrader(id: number) {
  return prisma.trader.findUnique({ where: { id } });
}
