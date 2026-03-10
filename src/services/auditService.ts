import { Prisma } from "@prisma/client";
import { prisma } from "../db/client";

export interface AuditLogInput {
  adminUser: string;
  action: string;
  entity: string;
  entityId?: string;
  before?: unknown;
  after?: unknown;
}

export async function writeAuditLog(input: AuditLogInput) {
  return prisma.adminAuditLog.create({
    data: {
      adminUser: input.adminUser,
      action: input.action,
      entity: input.entity,
      entityId: input.entityId,
      before: input.before === null || input.before === undefined
        ? Prisma.JsonNull
        : input.before as Prisma.InputJsonValue,
      after: input.after === null || input.after === undefined
        ? Prisma.JsonNull
        : input.after as Prisma.InputJsonValue,
    },
  });
}
