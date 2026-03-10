const SECTIONS = [
  { label: "Categories", path: "/admin/categories" },
  { label: "Plans", path: "/admin/plans" },
  { label: "Plan Access", path: "/admin/plan-access" },
  { label: "Settings", path: "/admin/settings" },
  { label: "Traders", path: "/admin/traders" },
  { label: "Audit Log", path: "/admin/audit-log" },
  { label: "Worker Logs", path: "/admin/worker-logs" },
];

export function renderLayout(title: string, activeSection: string, body: string): string {
  const navItems = SECTIONS.map((s) => {
    const isActive = s.label === activeSection;
    const style = isActive
      ? "color:#fff;background:#333;padding:6px 12px;border-radius:4px;text-decoration:none;font-weight:bold"
      : "color:#333;padding:6px 12px;text-decoration:none";
    return `<a href="${s.path}" style="${style}">${s.label}</a>`;
  }).join(" ");

  return `<!DOCTYPE html>
<html>
<head>
  <title>${title} - WhaleRadar Admin</title>
  <style>
    body { font-family: sans-serif; margin: 0; padding: 0; }
    .nav { background: #f5f5f5; padding: 10px 20px; border-bottom: 1px solid #ddd; display: flex; gap: 4px; align-items: center; flex-wrap: wrap; }
    .content { padding: 20px; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background: #f5f5f5; }
    button { padding: 4px 10px; cursor: pointer; }
    a { color: #0066cc; text-decoration: none; }
    .error { color: red; font-size: 0.9em; }
    label { display: block; margin-top: 12px; font-weight: bold; }
    input[type="text"], input[type="number"], textarea, select { display: block; margin-top: 4px; padding: 6px; width: 300px; }
    .actions { margin-bottom: 16px; }
    details summary { cursor: pointer; color: #0066cc; }
  </style>
</head>
<body>
  <div class="nav">${navItems}</div>
  <div class="content">
    <h1>${title}</h1>
    ${body}
  </div>
</body>
</html>`;
}
