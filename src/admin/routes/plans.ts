import { Router, Request, Response } from "express";
import { listPlans, getPlan, updatePlan } from "../../services/planService";
import { writeAuditLog } from "../../services/auditService";
import { renderPlanList } from "../templates/plans/list";
import { renderPlanForm } from "../templates/plans/form";

const router = Router();

function getAdminUser(req: Request): string {
  const authHeader = req.headers.authorization || "";
  const decoded = Buffer.from(authHeader.slice(6), "base64").toString();
  return decoded.split(":")[0] || "unknown";
}

router.get("/plans", async (_req: Request, res: Response) => {
  const plans = await listPlans();
  res.send(renderPlanList(plans));
});

router.get("/plans/:id/edit", async (req: Request, res: Response) => {
  const id = parseInt(req.params.id as string, 10);
  const plan = await getPlan(id);
  if (!plan) {
    res.status(404).send("Plan not found");
    return;
  }
  res.send(renderPlanForm(plan));
});

router.post("/plans/:id", async (req: Request, res: Response) => {
  const id = parseInt(req.params.id as string, 10);
  const current = await getPlan(id);
  if (!current) {
    res.status(404).send("Plan not found");
    return;
  }

  const { name, price, currency, billingPeriodDays, alertQuota, isActive } = req.body;
  const errors: Record<string, string> = {};

  if (!name || typeof name !== "string" || name.trim() === "") {
    errors.name = "Name is required";
  }

  const parsedPrice = parseInt(price, 10);
  if (isNaN(parsedPrice) || parsedPrice < 0) {
    errors.price = "Price must be a non-negative integer (cents)";
  }

  if (!currency || typeof currency !== "string" || currency.trim() === "") {
    errors.currency = "Currency is required";
  }

  const parsedBilling = billingPeriodDays ? parseInt(billingPeriodDays, 10) : null;
  if (billingPeriodDays && billingPeriodDays !== "" && (isNaN(parsedBilling!) || parsedBilling! < 1)) {
    errors.billingPeriodDays = "Billing period must be a positive integer";
  }

  const parsedQuota = alertQuota !== undefined && alertQuota !== "" ? parseInt(alertQuota, 10) : null;
  if (alertQuota !== undefined && alertQuota !== "" && (isNaN(parsedQuota!) || parsedQuota! < 0)) {
    errors.alertQuota = "Alert quota must be a non-negative integer";
  }

  if (Object.keys(errors).length > 0) {
    res.send(renderPlanForm({
      ...current,
      name: name ?? current.name,
      price: parsedPrice ?? current.price,
      currency: currency ?? current.currency,
      billingPeriodDays: parsedBilling ?? current.billingPeriodDays,
      alertQuota: parsedQuota ?? current.alertQuota,
      isActive: isActive === "on",
    }, errors));
    return;
  }

  const updated = await updatePlan(id, {
    name: name.trim(),
    price: parsedPrice,
    currency: currency.trim(),
    billingPeriodDays: parsedBilling,
    alertQuota: parsedQuota,
    isActive: isActive === "on",
  });

  await writeAuditLog({
    adminUser: getAdminUser(req),
    action: "update",
    entity: "Plan",
    entityId: String(id),
    before: current,
    after: updated,
  });

  res.redirect(302, "/admin/plans");
});

export default router;
