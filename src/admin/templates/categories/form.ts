import { Category } from "@prisma/client";
import { renderLayout } from "../layout";

export function renderCategoryForm(
  category?: Partial<Category>,
  errors?: Record<string, string>,
  allCategories?: Category[]
): string {
  const isEdit = category && "id" in category && category.id !== undefined;
  const action = isEdit ? `/admin/categories/${category!.id}` : "/admin/categories";
  const title = isEdit ? "Edit Category" : "New Category";

  const parentOptions = (allCategories || [])
    .filter((c) => !isEdit || c.id !== category!.id)
    .map(
      (c) =>
        `<option value="${c.id}" ${category?.parentCategoryId === c.id ? "selected" : ""}>${c.name}</option>`
    )
    .join("");

  const fieldError = (field: string) =>
    errors && errors[field] ? `<div class="error">${errors[field]}</div>` : "";

  const body = `
  <a href="/admin/categories">Back to list</a>
  <form method="POST" action="${action}">
    <label>Slug</label>
    <input type="text" name="slug" value="${category?.slug || ""}" ${isEdit ? "readonly" : "required"} />
    ${fieldError("slug")}

    <label>Name</label>
    <input type="text" name="name" value="${category?.name || ""}" required />
    ${fieldError("name")}

    <label>Description</label>
    <textarea name="description">${category?.description || ""}</textarea>

    <label>Source Identifier</label>
    <input type="text" name="sourceIdentifier" value="${(category as any)?.sourceIdentifier || ""}" />

    <label>Source Key</label>
    <input type="text" name="sourceKey" value="${(category as any)?.sourceKey || ""}" />

    <label>Parent Category</label>
    <select name="parentCategoryId">
      <option value="">None</option>
      ${parentOptions}
    </select>

    <label>Display Order</label>
    <input name="displayOrder" type="number" min="0" value="${category?.displayOrder ?? 0}" />
    ${fieldError("displayOrder")}

    <label>
      <input type="checkbox" name="isActive" ${category?.isActive !== false ? "checked" : ""} style="display:inline;width:auto" />
      Active
    </label>

    <label>
      <input type="checkbox" name="isVisibleToUsers" ${category?.isVisibleToUsers !== false ? "checked" : ""} style="display:inline;width:auto" />
      Visible to Users
    </label>

    <button type="submit" style="margin-top:16px;padding:8px 16px">${isEdit ? "Update" : "Create"}</button>
  </form>`;

  return renderLayout(title, "Categories", body);
}
