import { renderLayout } from "../layout";

interface PlanData {
  id: number;
  name: string;
  slug: string;
  price: number;
  currency: string;
  billingPeriodDays: number | null;
  alertQuota: number | null;
  isActive: boolean;
}

export function renderPlanForm(
  plan: PlanData,
  errors?: Record<string, string>
): string {
  const fieldError = (field: string) =>
    errors && errors[field] ? `<div class="error">${errors[field]}</div>` : "";

  const body = `
  <a href="/admin/plans">Back to list</a>
  <form method="POST" action="/admin/plans/${plan.id}">
    <label>Slug</label>
    <input type="text" value="${plan.slug}" readonly />

    <label>Name</label>
    <input type="text" name="name" value="${plan.name}" required />
    ${fieldError("name")}

    <label>Price (cents)</label>
    <input type="number" name="price" min="0" value="${plan.price}" required />
    ${fieldError("price")}

    <label>Currency</label>
    <input type="text" name="currency" value="${plan.currency}" required />
    ${fieldError("currency")}

    <label>Billing Period (days, leave empty for free plans)</label>
    <input type="number" name="billingPeriodDays" min="1" value="${plan.billingPeriodDays ?? ""}" />
    ${fieldError("billingPeriodDays")}

    <label>Alert Quota (leave empty for unlimited)</label>
    <input type="number" name="alertQuota" min="0" value="${plan.alertQuota ?? ""}" />
    ${fieldError("alertQuota")}

    <label>
      <input type="checkbox" name="isActive" ${plan.isActive ? "checked" : ""} style="display:inline;width:auto" />
      Active
    </label>

    <button type="submit" style="margin-top:16px;padding:8px 16px">Update</button>
  </form>`;

  return renderLayout("Edit Plan: " + plan.name, "Plans", body);
}
