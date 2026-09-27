import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/admin/roles';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';
import {
  parseOvieCertificationDecisionRequest,
  recordOvieCertificationDecision,
} from '@/lib/ovie/certifications/inventory.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'private, no-store' } as const;

function json(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, { status, headers });
}

/**
 * Founder certification decision (Certify / Request changes / Reject).
 *
 * A human founder decision needs a live browser session: bearer tokens are
 * refused, the admin role is read from Postgres, and the admin entitlement
 * additionally requires this session's passkey step-up (JOV-4806). The
 * reviewer identity always comes from the session, never from the body.
 */
export async function POST(request: Request): Promise<NextResponse> {
  if (request.headers.get('authorization')) {
    return json(
      {
        error: 'session_required',
        message: 'Founder decisions require a signed-in browser session.',
      },
      403
    );
  }

  let entitlements;
  try {
    entitlements = await getCurrentUserEntitlements({ session: 'fresh' });
  } catch {
    return json({ error: 'certification_decision_unavailable' }, 503);
  }
  if (!entitlements.isAuthenticated || !entitlements.userId) {
    return json({ error: 'unauthorized' }, 401);
  }
  if (!entitlements.isAdmin) {
    const hasAdminRole = await isAdmin(entitlements.userId).catch(() => false);
    return hasAdminRole
      ? json(
          {
            error: 'step_up_required',
            message: 'Unlock admin with your passkey, then try again.',
          },
          403
        )
      : json({ error: 'forbidden' }, 403);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid_request' }, 400);
  }
  const decision = parseOvieCertificationDecisionRequest(body);
  if (!decision) {
    return json(
      {
        error: 'invalid_request',
        message:
          'Send rowId, evidenceDigest, decision, actionId, and notes when requesting changes.',
      },
      400
    );
  }

  try {
    const outcome = await recordOvieCertificationDecision(
      decision,
      entitlements.email ?? entitlements.userId
    );
    if (!outcome.ok) {
      return json(
        { error: outcome.error, message: outcome.message },
        outcome.status
      );
    }
    return json({ row: outcome.row }, 200);
  } catch {
    return json({ error: 'certification_decision_unavailable' }, 503);
  }
}
