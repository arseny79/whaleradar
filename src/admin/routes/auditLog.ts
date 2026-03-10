import { Router, Request, Response } from "express";
import { prisma } from "../../db/client";
import { renderAuditLog } from "../templates/auditLog";

const router = Router();

router.get("/audit-log", async (_req: Request, res: Response) => {
  const logs = await prisma.adminAuditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  res.send(renderAuditLog(logs));
});

export default router;
