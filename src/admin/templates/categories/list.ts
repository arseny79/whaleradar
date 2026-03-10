import { Category } from "@prisma/client";
import { renderLayout } from "../layout";

export function renderCategoryList(categories: Category[]): string {
  const rows = categories
    .map(
      (cat) => `
      <tr draggable="true" data-id="${cat.id}">
        <td class="drag-handle" style="cursor:grab;text-align:center">&#x2630;</td>
        <td>${cat.id}</td>
        <td>${cat.slug}</td>
        <td>${cat.name}</td>
        <td>${cat.displayOrder}</td>
        <td>${cat.isActive ? "Yes" : "No"}</td>
        <td>${cat.isVisibleToUsers ? "Yes" : "No"}</td>
        <td>
          <a href="/admin/categories/${cat.id}/edit">Edit</a>
          <form method="POST" action="/admin/categories/${cat.id}/toggle-active" style="display:inline">
            <button type="submit">${cat.isActive ? "Deactivate" : "Activate"}</button>
          </form>
          <form method="POST" action="/admin/categories/${cat.id}/toggle-visible" style="display:inline">
            <button type="submit">${cat.isVisibleToUsers ? "Hide" : "Show"}</button>
          </form>
        </td>
      </tr>`
    )
    .join("");

  const body = `
  <div class="actions">
    <a href="/admin/categories/new">New Category</a>
  </div>
  <table id="categories-table">
    <thead>
      <tr>
        <th></th>
        <th>ID</th>
        <th>Slug</th>
        <th>Name</th>
        <th>Display Order</th>
        <th>Active</th>
        <th>Visible</th>
        <th>Actions</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>
  <script>
    (function() {
      const tbody = document.querySelector('#categories-table tbody');
      let dragRow = null;
      tbody.addEventListener('dragstart', function(e) {
        dragRow = e.target.closest('tr');
        e.dataTransfer.effectAllowed = 'move';
      });
      tbody.addEventListener('dragover', function(e) {
        e.preventDefault();
        const target = e.target.closest('tr');
        if (target && target !== dragRow) {
          const rect = target.getBoundingClientRect();
          const mid = rect.top + rect.height / 2;
          if (e.clientY < mid) {
            tbody.insertBefore(dragRow, target);
          } else {
            tbody.insertBefore(dragRow, target.nextSibling);
          }
        }
      });
      tbody.addEventListener('dragend', function() {
        const rows = tbody.querySelectorAll('tr');
        const orderedIds = Array.from(rows).map(r => parseInt(r.dataset.id, 10));
        fetch('/admin/categories/reorder', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderedIds })
        });
        dragRow = null;
      });
    })();
  </script>`;

  return renderLayout("Categories", "Categories", body);
}
