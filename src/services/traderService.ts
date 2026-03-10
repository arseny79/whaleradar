import { Trader } from "@prisma/client";
import { prisma } from "../db/client";
import { Prisma } from "@prisma/client";

type TxClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

const MAX_RETRIES = 3;

function suffixForIndex(index: number): string {
  if (index === 0) return "";
  return "-" + String.fromCharCode(65 + index);
}

async function generateUniqueAlias(
  categoryName: string,
  rank: number,
  tx: TxClient
): Promise<string> {
  for (let i = 0; i < 26; i++) {
    const candidate = `${categoryName} Trader #${rank}${suffixForIndex(i)}`;
    const existing = await tx.trader.findUnique({ where: { alias: candidate } });
    if (!existing) return candidate;
  }
  throw new Error(
    `Unable to generate unique alias for category "${categoryName}" rank ${rank}: all 26 suffix slots exhausted`
  );
}

function isUniqueConstraintError(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002"
  );
}

export async function findOrCreateTrader(
  walletAddress: string,
  categoryId: number,
  rank: number
): Promise<Trader> {
  const existing = await prisma.trader.findUnique({ where: { walletAddress } });

  if (existing) {
    if (existing.rank !== rank) {
      return prisma.trader.update({
        where: { id: existing.id },
        data: { rank },
      });
    }
    return existing;
  }

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await prisma.$transaction(async (tx) => {
        const alreadyCreated = await tx.trader.findUnique({
          where: { walletAddress },
        });
        if (alreadyCreated) {
          if (alreadyCreated.rank !== rank) {
            return tx.trader.update({
              where: { id: alreadyCreated.id },
              data: { rank },
            });
          }
          return alreadyCreated;
        }

        const category = await tx.category.findUnique({
          where: { id: categoryId },
        });
        if (!category) {
          throw new Error(`Category with id ${categoryId} not found`);
        }

        const alias = await generateUniqueAlias(category.name, rank, tx);

        return tx.trader.create({
          data: {
            walletAddress,
            categoryId,
            alias,
            rank,
          },
        });
      });
    } catch (err) {
      if (isUniqueConstraintError(err) && attempt < MAX_RETRIES - 1) {
        continue;
      }
      throw err;
    }
  }

  throw new Error("findOrCreateTrader: exhausted retries");
}

export function resolveAlias(trader: Trader): string {
  if (trader.aliasOverride && trader.aliasOverride.trim().length > 0) {
    return trader.aliasOverride;
  }
  return trader.alias;
}
