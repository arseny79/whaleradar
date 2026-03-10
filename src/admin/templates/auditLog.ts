import { renderLayout } from "./layout";

interface AuditRow {
  id: number;
  adminUser: string;
  action: string;
  entity: string;
  entityId: string | null;
  before: unknown;
  after: unknown;
  createdAt: Date;
}

function jsonDetails(label: string, data: unknown): string {
  if (data === null || data === undefined) return "—";
  return `<details><summary>${label}</summary><pre style="max-width:400px;overflow:auto;font-size:0.85em">${JSON.stringify(data, null, 2)}</pre></details>`;
}

export function renderAuditLog(logs: AuditRow[]): string {
  const rows = logs
    .map(
      (log) => `
      <tr>
        <td>${log.id}</td>
        <td>${log.createdAt.toISOString().replace("T", " ").slice(0, 19)}</td>
        <td>${log.adminUser}</td>
        <td>${log.action}</td>
        <td>${log.entity}</td>
        <td>${log.entityId ?? "—"}</td>
        <td>${jsonDetails("before", log.before)}</td>
        <td>${jsonDetails("after", log.after)}</td>
      </tr>`
    )
    .join("");

  const body = `
  <table>
    <thead>
      <tr>
        <th>ID</th>
        <th>Time</th>
        <th>Admin</th>
        <th>Action</th>
        <th>Entity</th>
        <th>Entity ID</th>
        <th>Before</th>
        <th>After</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`;

  return renderLayout("Audit Log", "Audit Log", body);
}
