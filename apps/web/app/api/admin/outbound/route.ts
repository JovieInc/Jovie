import { NextResponse } from 'next/server';
import { z } from 'zod';
import { parseJsonBody } from '@/lib/http/parse-json';
import {
  approveOutbound,
  decideOutboundTarget,
  getOutboundCertification,
  loadOutboundLead,
  saveOutboundCopy,
} from '@/lib/outbound/detail.server';
import { getOutboundQueue } from '@/lib/outbound/queue.server';
import {
  OUTBOUND_CHANNELS,
  OUTBOUND_REFUSAL_MESSAGES,
  OUTBOUND_REJECT_REASONS,
} from '@/lib/outbound/types';
import { getOvieOperatorEntitlements } from '@/lib/ovie/privacy-lock/access';

export const runtime = 'nodejs';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;
const jsonError = (error: string, status: number, extra = {}) =>
  NextResponse.json({ error, ...extra }, { status, headers: NO_STORE_HEADERS });

const copySchema = z.object({
  channel: z.enum(OUTBOUND_CHANNELS),
  subject: z.string().max(200).nullable(),
  body: z.string().min(1).max(4000),
});

const targetRef = z.object({
  leadId: z.string().uuid(),
  expectedTargetRevision: z.string().regex(/^[a-f0-9]{64}$/),
});

/** Approve and edits act on one person; only hold/reject may be bulk. */
const bodySchema = z.discriminatedUnion('action', [
  targetRef.extend({ action: z.literal('approve'), copy: copySchema }),
  targetRef.extend({ action: z.literal('save_copy'), copy: copySchema }),
  z.object({
    action: z.literal('hold'),
    items: z.array(targetRef).min(1).max(100),
    note: z.string().max(500).nullable().optional(),
  }),
  z.object({
    action: z.literal('reject'),
    items: z.array(targetRef).min(1).max(100),
    reason: z.enum(OUTBOUND_REJECT_REASONS),
    note: z.string().max(500).nullable().optional(),
  }),
]);

async function requireAdmin(purpose?: 'read') {
  const entitlements = await getOvieOperatorEntitlements(
    purpose ? { purpose } : { session: 'fresh' }
  );
  if (!entitlements.isAuthenticated)
    return { error: jsonError('Unauthorized', 401) };
  if (!entitlements.isAdmin || !entitlements.userId)
    return { error: jsonError('Forbidden', 403) };
  return { userId: entitlements.userId };
}

/**
 * GET /api/admin/outbound — the ranked outbound queue.
 * GET /api/admin/outbound?lead=<id> — per-fact certification for one row.
 * GET /api/admin/outbound?summary=1 — view counts only, for the sidebar.
 */
export async function GET(request: Request) {
  const gate = await requireAdmin('read');
  if (gate.error) return gate.error;

  const leadId = new URL(request.url).searchParams.get('lead');
  if (leadId) {
    if (!z.string().uuid().safeParse(leadId).success)
      return jsonError('Invalid lead', 400);
    const lead = await loadOutboundLead(leadId);
    if (!lead) return jsonError('Lead not found', 404);
    const certification = await getOutboundCertification(lead);
    return NextResponse.json({ certification }, { headers: NO_STORE_HEADERS });
  }

  const queue = await getOutboundQueue();
  // The Ovie sidebar badge reads only the counts on every page.
  if (new URL(request.url).searchParams.get('summary') === '1')
    return NextResponse.json(
      { generatedAt: queue.generatedAt, counts: queue.counts },
      { headers: NO_STORE_HEADERS }
    );
  return NextResponse.json(queue, { headers: NO_STORE_HEADERS });
}

/** POST /api/admin/outbound — Tim's approve / save copy / hold / reject. */
export async function POST(request: Request) {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;

  const parsed = await parseJsonBody<unknown>(request, {
    route: 'POST /api/admin/outbound',
    headers: NO_STORE_HEADERS,
  });
  if (!parsed.ok) return parsed.response;
  const body = bodySchema.safeParse(parsed.data);
  if (!body.success) return jsonError('Invalid request body', 400);

  const input = body.data;
  const actorUserId = gate.userId;
  if (input.action === 'approve' || input.action === 'save_copy') {
    const run = input.action === 'approve' ? approveOutbound : saveOutboundCopy;
    const result = await run({
      leadId: input.leadId,
      expectedTargetRevision: input.expectedTargetRevision,
      copy: input.copy,
      actorUserId,
    });
    if (!result.ok)
      return jsonError(OUTBOUND_REFUSAL_MESSAGES[result.reason], 409, {
        reason: result.reason,
      });
    return NextResponse.json({ ok: true }, { headers: NO_STORE_HEADERS });
  }

  const results = [];
  for (const item of input.items) {
    const result = await decideOutboundTarget({
      ...item,
      action: input.action,
      reason: input.action === 'reject' ? input.reason : null,
      note: input.note ?? null,
      actorUserId,
    });
    results.push({ leadId: item.leadId, ...result });
  }
  const failed = results.filter(result => !result.ok);
  return NextResponse.json(
    { ok: failed.length === 0, results },
    { status: failed.length ? 207 : 200, headers: NO_STORE_HEADERS }
  );
}
