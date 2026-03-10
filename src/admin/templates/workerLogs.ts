import { renderLayout } from "./layout";

interface WorkerLogRow {
  id: number;
  workerName: string;
  status: string;
  message: string | null;
  durationMs: number | null;
  tradersChecked: number;
  tradesFound: number;
  alertsSent: number;
  error: string | null;
  createdAt: Date;
}

export function renderWorkerLogs(logs: WorkerLogRow[]): string {
  const rows = logs
    .map(
      (log) => `
      <tr>
        <td>${log.id}</td>
        <td>${log.createdAt.toISOString().replace("T", " ").slice(0, 19)}</td>
        <td>${log.workerName}</td>
        <td>${log.status}</td>
        <td>${log.durationMs ?? "—"}</td>
        <td>${log.tradersChecked}</td>
        <td>${log.tradesFound}</td>
        <td>${log.alertsSent}</td>
        <td>${log.error ? `<details><summary>Error</summary><pre style="max-width:400px;overflow:auto;font-size:0.85em">${log.error}</pre></details>` : "—"}</td>
      </tr>`
    )
    .join("");

  const body = `
  <table>
    <thead>
      <tr>
        <th>ID</th>
        <th>Time</th>
        <th>Worker</th>
        <th>Status</th>
        <th>Duration (ms)</th>
        <th>Traders</th>
        <th>Trades</th>
        <th>Alerts</th>
        <th>Error</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`;

  return renderLayout("Worker Logs", "Worker Logs", body);
}
