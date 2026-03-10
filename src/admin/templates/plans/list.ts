import { renderLayout } from "../layout";

interface PlanRow {
  id: number;
  name: string;
  slug: string;
  price: number;
  currency: string;
  billingPeriodDays: number | null;
  alertQuota: number | null;
  isActive: boolean;
}

export function renderPlanList(plans: PlanRow[]): string {
  const rows = plans
    .map(
      (p) => `
      <tr>
        <td>${p.id}</td>
        <td>${p.slug}</td>
        <td>${p.name}</td>
        <td>${p.price === 0 ? "Free" : "$" + (p.price / 100).toFixed(2)}</td>
        <td>${p.currency}</td>
        <td>${p.billingPeriodDays ?? "—"}</td>
        <td>${p.alertQuota ?? "Unlimited"}</td>
        <td>${p.isActive ? "Yes" : "No"}</td>
        <td><a href="/admin/plans/${p.id}/edit">Edit</a></td>
      </tr>`
    )
    .join("");

  const body = `
  <table>
    <thead>
      <tr>
        <th>ID</th>
        <th>Slug</th>
        <th>Name</th>
        <th>Price</th>
        <th>Currency</th>
        <th>Billing Days</th>
        <th>Alert Quota</th>
        <th>Active</th>
        <th>Actions</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`;

  return renderLayout("Plans", "Plans", body);
}
