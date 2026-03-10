import { renderLayout } from "./layout";

export function renderSettings(
  settings: Record<string, string>,
  saved?: boolean,
  errors?: Record<string, string>
): string {
  const fieldError = (key: string) =>
    errors && errors[key] ? `<div class="error">${errors[key]}</div>` : "";

  const keys = Object.keys(settings).sort();

  const rows = keys
    .map(
      (key) => `
      <tr>
        <td><strong>${key}</strong></td>
        <td><input type="text" name="settings[${key}]" value="${settings[key]}" style="width:200px" /></td>
        <td>${fieldError(key)}</td>
      </tr>`
    )
    .join("");

  const savedMsg = saved ? `<div style="color:green;margin-bottom:12px">Settings saved.</div>` : "";

  const body = `
  ${savedMsg}
  <form method="POST" action="/admin/settings">
    <table>
      <thead>
        <tr>
          <th>Key</th>
          <th>Value</th>
          <th></th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <button type="submit" style="margin-top:16px;padding:8px 16px">Save</button>
  </form>`;

  return renderLayout("Settings", "Settings", body);
}
