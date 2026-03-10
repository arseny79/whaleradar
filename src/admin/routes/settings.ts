import { Router, Request, Response } from "express";
import { getAllSettings, upsertSetting } from "../../services/settingsService";
import { writeAuditLog } from "../../services/auditService";
import { renderSettings } from "../templates/settings";

const router = Router();

function getAdminUser(req: Request): string {
  const authHeader = req.headers.authorization || "";
  const decoded = Buffer.from(authHeader.slice(6), "base64").toString();
  return decoded.split(":")[0] || "unknown";
}

router.get("/settings", async (_req: Request, res: Response) => {
  const settings = await getAllSettings();
  res.send(renderSettings(settings));
});

router.post("/settings", async (req: Request, res: Response) => {
  const current = await getAllSettings();
  const incoming: Record<string, string> = req.body.settings || {};

  for (const [key, value] of Object.entries(incoming)) {
    const newValue = String(value).trim();
    if (current[key] !== newValue) {
      await upsertSetting(key, newValue);
      await writeAuditLog({
        adminUser: getAdminUser(req),
        action: "update",
        entity: "AppSetting",
        entityId: key,
        before: { key, value: current[key] ?? null },
        after: { key, value: newValue },
      });
    }
  }

  const updated = await getAllSettings();
  res.send(renderSettings(updated, true));
});

export default router;
