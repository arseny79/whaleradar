
---

## 📄 `docs/REQ-1-foundation.md`



## 📄 `docs/REQ-2-categories.md`

```markdown
# REQ-2: Category System — Service Layer, Keyboard Helper, Admin CRUD

## Overview
Build the category system on top of REQ-1's Prisma schema: a typed service layer, a paginated Telegram inline keyboard builder, and server-rendered admin routes with audit logging.

## Problem Statement
The bot's `/start` and `/categories` commands need a filtered, ordered category list. The admin panel needs full CRUD over categories. Neither can be built without a shared service layer and route handlers.

## Solution
Three deliverables: `categoryService.ts` (data access), `categoryKeyboard.ts` (Telegram UI), and `src/admin/routes/categories.ts` + templates (admin CRUD).

---

## Functional Requirements

### 1. Category Service — `src/services/categoryService.ts`

All functions use the singleton `PrismaClient` from `src/db/client.ts`.

| Function                                        | Behavior                                                                                             |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `getActiveVisibleCategories()`                  | Returns categories where `isActive=true` AND `isVisibleToUsers=true`, ordered by `displayOrder ASC` |
| `getAllCategories()`                            | Returns all categories ordered by `displayOrder ASC`                                                 |
| `getCategoryBySlug(slug)`                       | Returns matching category or `null`                                                                  |
| `getCategoryById(id)`                           | Returns matching category or `null`                                                                  |
| `createCategory(data: CreateCategoryInput)`     | Creates and returns new category                                                                     |
| `updateCategory(id, data: UpdateCategoryInput)` | Updates and returns category; throws if not found                                                    |
| `toggleCategoryActive(id, isActive)`            | Sets `isActive` field; returns updated category                                                      |
| `toggleCategoryVisible(id, isVisibleToUsers)`   | Sets `isVisibleToUsers` field; returns updated category                                              |
| `reorderCategories(orderedIds: number[])`       | Sets `displayOrder = array index` for each id in a single transaction; returns `Promise<void>`       |

**Input types:**

`CreateCategoryInput`: `slug` (string), `name` (string), `description?` (string), `sourceIdentifier?` (string), `sourceKey?` (string), `parentCategoryId?` (number), `isActive?` (boolean, default true), `isVisibleToUsers?` (boolean, default true), `displayOrder?` (number, default 0)

`UpdateCategoryInput`: all `CreateCategoryInput` fields optional except `slug` (immutable after creation — excluded from update input)

---

### 2. Telegram Keyboard Helper — `src/bot/keyboards/categoryKeyboard.ts`

- `buildCategoryKeyboard(categories: Category[], page?: number): InlineKeyboardMarkup`
- Each button label = `category.name`; `callback_data` = `select_category:{slug}`
- **≤ 8 categories**: single keyboard, one button per row, no navigation
- **> 8 categories**: paginate at 7 categories per page; page 0 is default
  - Last row on each page: Back (`category_page:{page-1}`) and/or Next (`category_page:{page+1}`) buttons as applicable
  - `page` parameter is 0-indexed
- Function is pure (no side effects, no DB calls) — accepts pre-fetched category array

---

### 3. Admin Panel — `src/admin/routes/categories.ts` + `src/admin/templates/categories/`

#### Routes

| Method | Path                                   | Action                    |
| ------ | -------------------------------------- | ------------------------- |
| GET    | `/admin/categories`                    | List all categories       |
| GET    | `/admin/categories/new`                | Render create form        |
| POST   | `/admin/categories`                    | Create category           |
| GET    | `/admin/categories/:id/edit`           | Render edit form          |
| POST   | `/admin/categories/:id`                | Update category           |
| POST   | `/admin/categories/:id/toggle-active`  | Toggle `isActive`         |
| POST   | `/admin/categories/:id/toggle-visible` | Toggle `isVisibleToUsers` |
| POST   | `/admin/categories/reorder`            | Reorder categories        |

#### Auth
- All routes protected by HTTP Basic Auth using `ADMIN_USERNAME` / `ADMIN_PASSWORD` from `src/config/index.ts`
- Unauthenticated requests receive `401` with `WWW-Authenticate: Basic realm="Admin"` header

#### HTTP Response Codes & Redirects
- All successful POST mutations respond with `302 Redirect` to `/admin/categories`
- Validation failures respond with `200` and re-render the form with errors (no redirect)
- Toggle routes (`toggle-active`, `toggle-visible`) must first fetch the current category state via `getCategoryById(id)`, then call the appropriate service function with the **flipped** boolean value (e.g., `toggleCategoryActive(id, !current.isActive)`). If the category is not found, respond with `404`.
- The `POST /admin/categories/reorder` route accepts `application/json` body `{ orderedIds: number[] }` and responds with `200 { ok: true }` on success (no redirect — called via fetch from the drag-and-drop handler)
- The drag-and-drop reorder in `renderCategoryList` uses the HTML5 Drag and Drop API with a small inline `<script>` block that serializes row order into an array of ids and POSTs to `/admin/categories/reorder` as JSON

#### Audit Log Details for Reorder
- For `POST /admin/categories/reorder`: `action = "reorder"`, `entity = "Category"`, `entityId = null`, `before = null`, `after = { orderedIds: number[] }` (the submitted array)

#### Audit Logging
Every mutating route (POST) writes one `AdminAuditLog` row:
- `adminUser`: username from Basic Auth credentials
- `action`: verb string — `"create"`, `"update"`, `"toggle_active"`, `"toggle_visible"`, `"reorder"`
- `entity`: `"Category"`
- `entityId`: category id as string (omit for reorder)
- `before`: JSON snapshot of category state before mutation (null for create)
- `after`: JSON snapshot of category state after mutation

#### Templates — `src/admin/templates/categories/`
Plain TypeScript functions returning HTML strings. No templating engine.

- `renderCategoryList(categories: Category[]): string`
  - Table with columns: ID, Slug, Name, Display Order, Active, Visible, Actions
  - Actions per row: Edit, Toggle Active, Toggle Visible
  - "New Category" button links to `/admin/categories/new`
  - Drag-handle column for reorder; reorder submits to `POST /admin/categories/reorder` with ordered id array

- `renderCategoryForm(category?: Category, errors?: Record<string, string>, allCategories?: Category[]): string`
  - The `allCategories` parameter is required to populate the `parentCategoryId` select dropdown; route handlers must pass the result of `getAllCategories()` when rendering the form
  - Fields: `name` (text, required), `description` (textarea), `sourceIdentifier` (text), `sourceKey` (text), `parentCategoryId` (select populated from `allCategories`, excluding the current category to prevent self-reference), `isActive` (checkbox), `isVisibleToUsers` (checkbox), `displayOrder` (number)
  - `slug` field: editable on create, read-only on edit
  - Inline field-level error messages when `errors` is provided
  - Submit posts to `/admin/categories` (create) or `/admin/categories/:id` (edit)

#### Validation (server-side)
- `slug`: required, lowercase alphanumeric + hyphens only, unique
- `name`: required, non-empty
- `displayOrder`: integer ≥ 0
- On validation failure: re-render form with errors, no DB write, no audit log entry

---

## Technical Requirements

- `categoryService.ts` has no Express or Telegram dependencies — pure data access
- `categoryKeyboard.ts` has no DB or Express dependencies — pure transformation
- `reorderCategories` uses a Prisma transaction so all `displayOrder` updates are atomic
- Admin routes import `categoryService` functions; no direct Prisma calls in route handlers
- All TypeScript files compile under `strict: true` with no errors
- No external templating libraries (Handlebars, EJS, etc.) — HTML is built with template literals

---

## Acceptance Criteria

- [ ] Given categories with mixed `isActive`/`isVisibleToUsers` states exist, When `getActiveVisibleCategories()` is called, Then only categories with both flags true are returned, ordered by `displayOrder ASC`
- [ ] Given `reorderCategories([3, 1, 2])` is called, When the transaction completes, Then category id 3 has `displayOrder=0`, id 1 has `displayOrder=1`, id 2 has `displayOrder=2`
- [ ] Given 8 or fewer categories, When `buildCategoryKeyboard(categories)` is called, Then the returned markup has one button per row with no navigation buttons
- [ ] Given 9 categories and `page=0`, When `buildCategoryKeyboard(categories, 0)` is called, Then 7 category buttons appear plus a Next button with `callback_data="category_page:1"`; no Back button
- [ ] Given 9 categories and `page=1`, When `buildCategoryKeyboard(categories, 1)` is called, Then 2 category buttons appear plus a Back button with `callback_data="category_page:0"`; no Next button
- [ ] Given a request to any `/admin/categories` route with no credentials, When the request is processed, Then the response is 401 with a `WWW-Authenticate` header
- [ ] Given valid admin credentials, When `POST /admin/categories` is called with valid data, Then a new Category row is created and one `AdminAuditLog` row is written with `action="create"`, `entity="Category"`, and `before=null`
- [ ] Given valid admin credentials, When `POST /admin/categories/:id` is called with updated data, Then the Category row is updated and one `AdminAuditLog` row is written with `action="update"` and non-null `before` and `after` JSON
- [ ] Given valid admin credentials, When `POST /admin/categories/:id/toggle-active` is called, Then `isActive` is flipped and one `AdminAuditLog` row is written with `action="toggle_active"`
- [ ] Given a create form submission with a duplicate slug, When the route handler processes it, Then no DB write occurs, no audit log entry is created, and the form re-renders with a slug uniqueness error
- [ ] Given `updateCategory` is called with an id that does not exist, When the function executes, Then it throws an error without writing to the database
- [ ] Given the TypeScript compiler runs with `strict: true`, When all three files are compiled, Then compilation exits with code 0 and no type errors
```

