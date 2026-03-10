import { renderLayout } from "./layout";
import { Trader, Category } from "@prisma/client";

type TraderWithCategory = Trader & { category: Category | null };

function truncateWallet(addr: string): string {
  if (addr.length <= 10) return addr;
  return addr.slice(0, 6) + "\u2026" + addr.slice(-4);
}

export function renderTraderList(
  traders: TraderWithCategory[],
  page: number,
  totalPages: number
): string {
  const rows = traders
    .map(
      (t) => `
      <tr>
        <td>${t.id}</td>
        <td title="${t.walletAddress}">${truncateWallet(t.walletAddress)}</td>
        <td>${t.alias}</td>
        <td>${t.aliasOverride ?? "—"}</td>
        <td>${t.category?.name ?? "—"}</td>
        <td>${t.rank ?? "—"}</td>
        <td>${t.isTracked ? "Yes" : "No"}</td>
        <td>
          <form method="POST" action="/admin/traders/${t.id}/toggle-active" style="display:inline">
            <button type="submit">${t.isTracked ? "Deactivate" : "Activate"}</button>
          </form>
          <details style="display:inline-block;margin-left:8px">
            <summary>Edit Alias</summary>
            <form method="POST" action="/admin/traders/${t.id}/alias" style="margin-top:4px">
              <input type="text" name="alias" value="${t.aliasOverride ?? ""}" placeholder="Custom alias" style="width:150px" />
              <button type="submit">Save</button>
            </form>
          </details>
        </td>
      </tr>`
    )
    .join("");

  const pagination: string[] = [];
  if (page > 1) {
    pagination.push(`<a href="/admin/traders?page=${page - 1}">Previous</a>`);
  }
  pagination.push(`Page ${page} of ${totalPages}`);
  if (page < totalPages) {
    pagination.push(`<a href="/admin/traders?page=${page + 1}">Next</a>`);
  }

  const body = `
  <table>
    <thead>
      <tr>
        <th>ID</th>
        <th>Wallet</th>
        <th>Alias</th>
        <th>Custom Alias</th>
        <th>Category</th>
        <th>Rank</th>
        <th>Tracked</th>
        <th>Actions</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <div style="margin-top:12px;display:flex;gap:12px;align-items:center">${pagination.join(" ")}</div>`;

  return renderLayout("Traders", "Traders", body);
}
