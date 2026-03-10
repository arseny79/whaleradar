import { Router, Request, Response } from "express";
import { getMatrix, replaceAll } from "../../services/planAccessService";
import { writeAuditLog } from "../../services/auditService";
import { renderPlanAccessMatrix } from "../templates/planAccess";

const router = Router();

function getAdminUser(req: Request): string {
  const authHeader = req.headers.authorization || "";
  const decoded = Buffer.from(authHeader.slice(6), "base64").toString();
  return decoded.split(":")[0] || "unknown";
}

router.get("/plan-access", async (_req: Request, res: Response) => {
  const matrix = await getMatrix();
  res.send(renderPlanAccessMatrix(matrix));
});

router.post("/plan-access", async (req: Request, res: Response) => {
  const beforeMatrix = await getMatrix();

  const newAccess: Record<string, string[]> = {};
  const accessData = req.body.access || {};
  for (const [planId, values] of Object.entries(accessData)) {
    if (Array.isArray(values)) {
      newAccess[planId] = values.map(String);
    } else if (typeof values === "string") {
      newAccess[planId] = [values];
    }
  }

  await replaceAll(newAccess);

  await writeAuditLog({
    adminUser: getAdminUser(req),
    action: "replace_all",
    entity: "PlanCategoryAccess",
    before: beforeMatrix.access,
    after: newAccess,
  });

  res.redirect(302, "/admin/plan-access");
});

export default router;
