/**
 * Read-only Devin API client (JOV-6508).
 * Requires DEVIN_API_KEY (org service user key) — absent key disables the
 * source; the job logs and continues. The API is used read-only: list
 * sessions + per-session detail. Never launches sessions.
 */

const API = 'https://api.devin.ai/v1';
export const DEVIN_SESSION_URL = (id: string) =>
  `https://app.devin.ai/sessions/${id}`;

export interface DevinSession {
  session_id: string;
  title?: string;
  status?: string;
  status_enum?: string;
  created_at?: string;
  updated_at?: string;
  pull_request?: { url?: string } | null;
  structured_output?: Record<string, unknown> | null;
  acu_consumed?: number | null;
  model?: string | null;
}

export class DevinClient {
  constructor(private key: string) {}

  static create(): DevinClient | null {
    const key = process.env.DEVIN_API_KEY;
    return key ? new DevinClient(key) : null;
  }

  private async get<T>(path: string): Promise<T> {
    const res = await fetch(`${API}${path}`, {
      headers: { Authorization: `Bearer ${this.key}` },
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`devin ${path} HTTP ${res.status}`);
    return res.json() as Promise<T>;
  }

  async listSessions(limit = 100): Promise<DevinSession[]> {
    const r = await this.get<{ sessions?: DevinSession[] }>(
      `/sessions?limit=${limit}`
    );
    return r.sessions ?? [];
  }

  async getSession(id: string): Promise<DevinSession> {
    return this.get<DevinSession>(`/session/${id}`);
  }
}

const FINISHED = new Set([
  'finished',
  'stopped',
  'blocked',
  'expired',
  'suspend',
]);

/** True when a Devin session has reached a terminal-ish state. */
export function devinSessionFinished(s: DevinSession): boolean {
  const st = (s.status_enum ?? s.status ?? '').toLowerCase();
  return FINISHED.has(st);
}
