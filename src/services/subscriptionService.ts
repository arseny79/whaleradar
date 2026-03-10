import { UserSubscription } from "@prisma/client";
import { prisma } from "../db/client";

export async function getActiveSubscription(
  userId: number
): Promise<UserSubscription | null> {
  return prisma.userSubscription.findFirst({
    where: {
      userId,
      status: "active",
      endDate: { gt: new Date() },
    },
    orderBy: { endDate: "desc" },
  });
}
