import { NextResponse } from 'next/server';
import { captureError } from '@/lib/error-tracking';
import { authorizeSummerControl } from '@/lib/ovie/control';
import { FLEET_AUDIT_MAX_LIMIT } from '@/lib/ovie/fleet-audit';
import {
  getFleetAuditSummary,
  getFleetAuditWho,
} from '@/lib/ovie/fleet-audit.server';
import { resolveOviePrincipal } from '@/lib/ovie/mcp/principal';

export const runtime = 'nodejs';

const ROUTE = '/api/ovie/fleet-audit';
const headers = { 'Cache-Control': 'private, no-store' } as const;

function json(body: Readonly<Record<string, unknown>>, status: number) {
  return NextResponse.json(body, { status, headers });
}

/**
 * Admin-only proxy to the fleet audit Worker. The read token lives in server
 * env and never reaches the browser. No `target` returns the summary.
 */
export async function GET(request: Request): Promise<NextResponse> {
  let gate;
  try {
    gate = authorizeSummerControl(await resolveOviePrincipal(request));
  } catch {
    return json({ error: 'fleet_audit_unavailable' }, 503);
  }
  if (!gate.ok) {
    return json(
      { error: gate.status === 401 ? 'unauthorized' : 'forbidden' },
      gate.status
    );
  }

  const params = new URL(request.url).searchParams;
  const target = params.get('target')?.trim() ?? '';
  const since = params.get('since')?.trim() || undefined;
  const limitParam = params.get('limit');
  const limit = limitParam === null ? undefined : Number(limitParam);
  if (
    target.length > 200 ||
    (since !== undefined && Number.isNaN(Date.parse(since))) ||
    (limit !== undefined &&
      (!Number.isInteger(limit) || limit < 1 || limit > FLEET_AUDIT_MAX_LIMIT))
  ) {
    return json({ error: 'invalid_query' }, 400);
  }

  try {
    const result = target
      ? await getFleetAuditWho({
          target,
          since: since ? new Date(since).toISOString() : undefined,
          limit,
        })
      : await getFleetAuditSummary();
    if (result.state === 'not_configured')
      return json({ state: 'not_configured' }, 200);
    if (result.state === 'unavailable')
      return json({ error: 'fleet_audit_unavailable' }, 503);
    return json({ state: 'ok', ...result.data }, 200);
  } catch (error) {
    await captureError('Fleet audit proxy failed', error, { route: ROUTE });
    return json({ error: 'fleet_audit_unavailable' }, 503);
  }
}
