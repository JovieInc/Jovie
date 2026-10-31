import 'server-only';

import { env } from '@/lib/env-server';
import {
  FLEET_AUDIT_MAX_LIMIT,
  type FleetAuditResult,
  type FleetAuditSummary,
  type FleetAuditWho,
} from './fleet-audit';

const DEFAULT_URL = 'https://jovie-fleet-audit.tim-fd8.workers.dev';

function config(): { origin: string; token: string } | null {
  const token = env.FLEET_AUDIT_READ_TOKEN?.trim();
  if (!token) return null;
  try {
    const url = new URL(env.FLEET_AUDIT_URL?.trim() || DEFAULT_URL);
    const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
    if (url.protocol !== 'https:' && !(loopback && url.protocol === 'http:'))
      return null;
    return { origin: url.origin, token };
  } catch {
    return null;
  }
}

async function get<T>(
  path: string,
  fetcher: typeof fetch
): Promise<FleetAuditResult<T>> {
  const cfg = config();
  if (!cfg) return { state: 'not_configured' };
  try {
    const response = await fetcher(`${cfg.origin}${path}`, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${cfg.token}`,
      },
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return { state: 'unavailable' };
    const body = (await response.json()) as { ok?: boolean } & Record<
      string,
      unknown
    >;
    if (body.ok !== true) return { state: 'unavailable' };
    return { state: 'ok', data: body as unknown as T };
  } catch {
    return { state: 'unavailable' };
  }
}

export function getFleetAuditSummary(
  fetcher: typeof fetch = fetch
): Promise<FleetAuditResult<FleetAuditSummary>> {
  return get<FleetAuditSummary>('/v1/summary', fetcher);
}

export function getFleetAuditWho(
  input: { target: string; since?: string; limit?: number },
  fetcher: typeof fetch = fetch
): Promise<FleetAuditResult<FleetAuditWho>> {
  const query = new URLSearchParams({ target: input.target });
  if (input.since) query.set('since', input.since);
  const limit = Math.min(
    Math.max(Math.trunc(input.limit ?? 50), 1),
    FLEET_AUDIT_MAX_LIMIT
  );
  query.set('limit', String(limit));
  return get<FleetAuditWho>(`/v1/who?${query}`, fetcher);
}
