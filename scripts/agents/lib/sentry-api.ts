/**
 * Minimal Sentry API helpers for post-land incident join (JOV-6508).
 * Requires SENTRY_AUTH_TOKEN + SENTRY_ORG_SLUG (already used by
 * apps/web/lib/admin/sentry-metrics.ts). Read-only.
 */

const API = 'https://sentry.io/api/0';

export function sentryConfigured(): boolean {
  return Boolean(process.env.SENTRY_AUTH_TOKEN && process.env.SENTRY_ORG_SLUG);
}

async function se<T>(path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${process.env.SENTRY_AUTH_TOKEN}` },
    signal: AbortSignal.timeout(30_000),
  });
  if (res.status === 404) return null as T;
  if (!res.ok) throw new Error(`sentry ${path} HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

export interface SentryIssue {
  id: string;
  shortId?: string;
  lastSeen?: string;
  firstSeen?: string;
}

/**
 * Issues last-seen within [startIso, endIso]. Capped at `limit` — the daily
 * labeler only needs recent incidents overlapping merge windows.
 */
export async function listIssuesSince(
  startIso: string,
  limit = 50
): Promise<SentryIssue[]> {
  const org = process.env.SENTRY_ORG_SLUG;
  const issues = await se<SentryIssue[] | null>(
    `/organizations/${org}/issues/?query=${encodeURIComponent(
      'is:unresolved'
    )}&start=${encodeURIComponent(startIso)}&statsPeriod=&limit=${limit}`
  );
  return issues ?? [];
}

interface SentryFrame {
  filename?: string | null;
  absPath?: string | null;
}

/** Filenames appearing in the latest event's stack frames for an issue. */
export async function issueStackFilenames(issueId: string): Promise<string[]> {
  const event = await se<{
    entries?: {
      type: string;
      data?: { values?: { stacktrace?: { frames?: SentryFrame[] } }[] };
    };
  } | null>(`/issues/${issueId}/events/latest/`);
  const files = new Set<string>();
  for (const entry of event?.entries ?? []) {
    if (entry.type !== 'exception' && entry.type !== 'stacktrace') continue;
    for (const v of entry.data?.values ?? []) {
      for (const f of v.stacktrace?.frames ?? []) {
        if (f.filename) files.add(f.filename);
        if (f.absPath) files.add(f.absPath);
      }
    }
  }
  return [...files];
}
