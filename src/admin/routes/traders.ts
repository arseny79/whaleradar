import { Router, Request, Response } from "express";
import { listTraders, toggleActive, updateAlias, getTrader } from "../../services/traderAdminService";
import { writeAuditLog } from "../../services/auditService";
import { renderTraderList } from "../templates/traders";

const router = Router();

function getAdminUser(req: Request): string {
  const authHeader = req.headers.authorization || "";
  const decoded = Buffer.from(authHeader.slice(6), "base64").toString();
  return decoded.split(":")[0] || "unknown";
}

router.get("/traders", async (req: Request, res: Response) => {
  const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
  const result = await listTraders(page, 25);
  res.send(renderTraderList(result.traders, result.page, result.totalPages));
});

router.post("/traders/:id/toggle-active", async (req: Request, res: Response) => {
  const id = parseInt(req.params.id as string, 10);
  const before = await getTrader(id);
  const ok = await toggleActive(id);
  if (!ok) {
    res.status(404).send("Trader not found");
    return;
  }
  const after = await getTrader(id);

  await writeAuditLog({
    adminUser: getAdminUser(req),
    action: "toggle_active",
    entity: "Trader",
    entityId: String(id),
    before,
    after,
  });

  res.redirect(302, "/admin/traders");
});

router.post("/traders/:id/alias", async (req: Request, res: Response) => {
  const id = parseInt(req.params.id as string, 10);
  const before = await getTrader(id);
  const alias = req.body.alias || "";
  const ok = await updateAlias(id, alias);
  if (!ok) {
    res.status(404).send("Trader not found");
    return;
  }
  const after = await getTrader(id);

  await writeAuditLog({
    adminUser: getAdminUser(req),
    action: "update_alias",
    entity: "Trader",
    entityId: String(id),
    before,
    after,
  });

  res.redirect(302, "/admin/traders");
});

export default router;
