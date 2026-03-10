import { Router, Request, Response } from "express";
import { prisma } from "../../db/client";
import { renderWorkerLogs } from "../templates/workerLogs";

const router = Router();

router.get("/worker-logs", async (_req: Request, res: Response) => {
  const logs = await prisma.workerLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  res.send(renderWorkerLogs(logs));
});

export default router;
