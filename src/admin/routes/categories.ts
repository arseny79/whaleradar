import { Router, Request, Response } from "express";
import {
  getAllCategories,
  getCategoryById,
  getCategoryBySlug,
  createCategory,
  updateCategory,
  toggleCategoryActive,
  toggleCategoryVisible,
  reorderCategories,
} from "../../services/categoryService";
import { writeAuditLog } from "../../services/auditService";
import { renderCategoryList } from "../templates/categories/list";
import { renderCategoryForm } from "../templates/categories/form";

const router = Router();

function getAdminUser(req: Request): string {
  const authHeader = req.headers.authorization || "";
  const decoded = Buffer.from(authHeader.slice(6), "base64").toString();
  return decoded.split(":")[0] || "unknown";
}

router.get("/categories", async (_req: Request, res: Response) => {
  const categories = await getAllCategories();
  res.send(renderCategoryList(categories));
});

router.get("/categories/new", async (_req: Request, res: Response) => {
  const allCategories = await getAllCategories();
  res.send(renderCategoryForm(undefined, undefined, allCategories));
});

router.post("/categories/reorder", async (req: Request, res: Response) => {
  const { orderedIds } = req.body;
  if (!Array.isArray(orderedIds)) {
    res.status(400).json({ error: "orderedIds must be an array" });
    return;
  }

  await reorderCategories(orderedIds);

  await writeAuditLog({
    adminUser: getAdminUser(req),
    action: "reorder",
    entity: "Category",
    entityId: undefined,
    before: null,
    after: { orderedIds },
  });

  res.json({ ok: true });
});

router.post("/categories", async (req: Request, res: Response) => {
  const { slug, name, description, sourceIdentifier, sourceKey, parentCategoryId, isActive, isVisibleToUsers, displayOrder } = req.body;
  const errors: Record<string, string> = {};

  if (!slug || typeof slug !== "string" || slug.trim() === "") {
    errors.slug = "Slug is required";
  } else if (!/^[a-z0-9-]+$/.test(slug)) {
    errors.slug = "Slug must be lowercase alphanumeric and hyphens only";
  }

  if (!name || typeof name !== "string" || name.trim() === "") {
    errors.name = "Name is required";
  }

  const parsedOrder = parseInt(displayOrder, 10);
  if (displayOrder !== undefined && displayOrder !== "" && (isNaN(parsedOrder) || parsedOrder < 0)) {
    errors.displayOrder = "Display order must be an integer >= 0";
  }

  if (!errors.slug) {
    const existing = await getCategoryBySlug(slug);
    if (existing) {
      errors.slug = "A category with this slug already exists";
    }
  }

  if (Object.keys(errors).length > 0) {
    const allCategories = await getAllCategories();
    res.status(200).send(renderCategoryForm(
      { slug, name, description, sourceIdentifier, sourceKey, parentCategoryId, isActive, isVisibleToUsers, displayOrder } as any,
      errors,
      allCategories
    ));
    return;
  }

  const created = await createCategory({
    slug: slug.trim(),
    name: name.trim(),
    description: description || undefined,
    sourceIdentifier: sourceIdentifier || undefined,
    sourceKey: sourceKey || undefined,
    parentCategoryId: parentCategoryId ? parseInt(parentCategoryId, 10) : undefined,
    isActive: isActive === "on" || isActive === true,
    isVisibleToUsers: isVisibleToUsers === "on" || isVisibleToUsers === true,
    displayOrder: parsedOrder || 0,
  });

  await writeAuditLog({
    adminUser: getAdminUser(req),
    action: "create",
    entity: "Category",
    entityId: String(created.id),
    before: null,
    after: created,
  });

  res.redirect(302, "/admin/categories");
});

router.get("/categories/:id/edit", async (req: Request, res: Response) => {
  const id = parseInt(req.params.id as string, 10);
  const category = await getCategoryById(id);
  if (!category) {
    res.status(404).send("Category not found");
    return;
  }
  const allCategories = await getAllCategories();
  res.send(renderCategoryForm(category, undefined, allCategories));
});

router.post("/categories/:id/toggle-active", async (req: Request, res: Response) => {
  const id = parseInt(req.params.id as string, 10);
  const current = await getCategoryById(id);
  if (!current) {
    res.status(404).send("Category not found");
    return;
  }

  const updated = await toggleCategoryActive(id, !current.isActive);

  await writeAuditLog({
    adminUser: getAdminUser(req),
    action: "toggle_active",
    entity: "Category",
    entityId: String(id),
    before: current,
    after: updated,
  });

  res.redirect(302, "/admin/categories");
});

router.post("/categories/:id/toggle-visible", async (req: Request, res: Response) => {
  const id = parseInt(req.params.id as string, 10);
  const current = await getCategoryById(id);
  if (!current) {
    res.status(404).send("Category not found");
    return;
  }

  const updated = await toggleCategoryVisible(id, !current.isVisibleToUsers);

  await writeAuditLog({
    adminUser: getAdminUser(req),
    action: "toggle_visible",
    entity: "Category",
    entityId: String(id),
    before: current,
    after: updated,
  });

  res.redirect(302, "/admin/categories");
});

router.post("/categories/:id", async (req: Request, res: Response) => {
  const id = parseInt(req.params.id as string, 10);
  const current = await getCategoryById(id);
  if (!current) {
    res.status(404).send("Category not found");
    return;
  }

  const { name, description, sourceIdentifier, sourceKey, parentCategoryId, isActive, isVisibleToUsers, displayOrder } = req.body;
  const errors: Record<string, string> = {};

  if (!name || typeof name !== "string" || name.trim() === "") {
    errors.name = "Name is required";
  }

  const parsedOrder = parseInt(displayOrder, 10);
  if (displayOrder !== undefined && displayOrder !== "" && (isNaN(parsedOrder) || parsedOrder < 0)) {
    errors.displayOrder = "Display order must be an integer >= 0";
  }

  if (Object.keys(errors).length > 0) {
    const allCategories = await getAllCategories();
    res.status(200).send(renderCategoryForm(current, errors, allCategories));
    return;
  }

  const updated = await updateCategory(id, {
    name: name.trim(),
    description: description || undefined,
    sourceIdentifier: sourceIdentifier || undefined,
    sourceKey: sourceKey || undefined,
    parentCategoryId: parentCategoryId ? parseInt(parentCategoryId, 10) : undefined,
    isActive: isActive === "on" || isActive === true,
    isVisibleToUsers: isVisibleToUsers === "on" || isVisibleToUsers === true,
    displayOrder: parsedOrder || 0,
  });

  await writeAuditLog({
    adminUser: getAdminUser(req),
    action: "update",
    entity: "Category",
    entityId: String(id),
    before: current,
    after: updated,
  });

  res.redirect(302, "/admin/categories");
});

export default router;
