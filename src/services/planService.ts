import { prisma } from "../db/client";
import { Plan } from "@prisma/client";

export async function listPlans() {
  return prisma.plan.findMany({
    orderBy: { price: "asc" },
    include: {
      categoryAccess: { include: { category: true } },
    },
  });
}

export async function getPlan(id: number) {
  return prisma.plan.findUnique({
    where: { id },
    include: {
      categoryAccess: { include: { category: true } },
    },
  });
}

export async function updatePlan(
  id: number,
  data: {
    name: string;
    price: number;
    currency: string;
    billingPeriodDays: number | null;
    alertQuota: number | null;
    isActive: boolean;
  }
): Promise<Plan> {
  return prisma.plan.update({
    where: { id },
    data,
  });
}
