import { renderLayout } from "./layout";

interface MatrixData {
  plans: Array<{ id: number; name: string; slug: string }>;
  categories: Array<{ id: number; name: string; slug: string }>;
  access: Record<string, string[]>;
}

export function renderPlanAccessMatrix(matrix: MatrixData): string {
  const headerCells = matrix.plans.map((p) => `<th>${p.name}</th>`).join("");

  const rows = matrix.categories
    .map((cat) => {
      const cells = matrix.plans
        .map((plan) => {
          const checked = matrix.access[String(plan.id)]?.includes(String(cat.id)) ? "checked" : "";
          return `<td style="text-align:center"><input type="checkbox" name="access[${plan.id}]" value="${cat.id}" ${checked} /></td>`;
        })
        .join("");
      return `<tr><td>${cat.name}</td>${cells}</tr>`;
    })
    .join("");

  const body = `
  <form method="POST" action="/admin/plan-access">
    <table>
      <thead>
        <tr>
          <th>Category</th>
          ${headerCells}
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <button type="submit" style="margin-top:16px;padding:8px 16px">Save</button>
  </form>`;

  return renderLayout("Plan Category Access", "Plan Access", body);
}
