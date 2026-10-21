import { timingSafeEqual } from 'node:crypto';
import { and, sql as drizzleSql, eq, isNotNull } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { leads } from '@/lib/db/schema/leads';
import { env } from '@/lib/env-server';
import { captureError } from '@/lib/error-tracking';
import { parseJsonBody } from '@/lib/http/parse-json';
import { recordLeadFunnelEventReceipt } from '@/lib/leads/funnel-events';

export const runtime = 'nodejs';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;
const eventSchema = z.object({ event_type: z.string().min(1).max(128) });
const replySchema = eventSchema.extend({
  event_type: z.literal('reply_received'),
  campaign_id: z.string().uuid(),
  lead_email: z.string().trim().email().max(320),
  timestamp: z.string().datetime({ offset: true }),
  email_id: z.string().min(1).max(256).optional(),
});

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}

/**
 * Instantly supports custom headers, not webhook signatures. Authenticate
 * before reading JSON; never use the outbound API key as the webhook secret.
 * Receipt capture remains available while audience delivery is disabled.
 */
export async function POST(request: Request) {
  const secret = env.INSTANTLY_WEBHOOK_SECRET;
  const campaignId = env.INSTANTLY_CAMPAIGN_ID;
  if (!secret || secret.length < 32 || !campaignId) {
    return json({ error: 'Webhook not configured' }, 503);
  }

  const expected = Buffer.from(`Bearer ${secret}`);
  const provided = Buffer.from(request.headers.get('authorization') ?? '');
  if (
    provided.length !== expected.length ||
    !timingSafeEqual(provided, expected)
  ) {
    return json({ error: 'Unauthorized' }, 401);
  }

  try {
    const parsed = await parseJsonBody(request, {
      route: '/api/webhooks/instantly',
      headers: NO_STORE_HEADERS,
      redactParseErrors: true,
    });
    if (!parsed.ok) return parsed.response;

    const event = eventSchema.safeParse(parsed.data);
    if (!event.success) return json({ error: 'Invalid event' }, 400);
    // Auto-replies and engagement events must not fill the Replied view.
    if (event.data.event_type !== 'reply_received') {
      return json({ received: true, ignored: true });
    }

    const reply = replySchema.safeParse(parsed.data);
    if (!reply.success) return json({ error: 'Invalid reply event' }, 400);
    if (reply.data.campaign_id !== campaignId) {
      return json({ received: true, ignored: true });
    }

    // The documented webhook identifies the lead by email, not provider lead
    // ID. Only attribute an unambiguous match already enrolled through Jovie.
    const matches = await db
      .select({ id: leads.id, instantlyLeadId: leads.instantlyLeadId })
      .from(leads)
      .where(
        and(
          eq(
            drizzleSql`lower(${leads.contactEmail})`,
            reply.data.lead_email.toLowerCase()
          ),
          isNotNull(leads.instantlyLeadId)
        )
      )
      .limit(2);
    if (matches.length === 0) return json({ received: true, ignored: true });
    if (matches.length > 1) {
      return json({ error: 'Ambiguous lead match' }, 409);
    }
    const lead = matches[0]!;

    // One reply milestone per lead, matching the Outbound view. The existing
    // unique (lead_id, event_type) constraint dedupes retries across instances.
    const inserted = await recordLeadFunnelEventReceipt(
      {
        leadId: lead.id,
        eventType: 'email_replied',
        channel: 'email',
        provider: 'instantly',
        campaignKey: 'claim_invite',
        occurredAt: new Date(reply.data.timestamp),
        metadata: {
          campaignId,
          instantlyLeadId: lead.instantlyLeadId,
          emailId: reply.data.email_id ?? null,
        },
      },
      { required: true }
    );
    return json({ received: true, deduped: !inserted });
  } catch {
    // Query errors can contain email parameters. Keep receipt diagnostics free
    // of contact details, credentials, raw payloads and reply content.
    await captureError(
      'Instantly reply capture failed',
      new Error('Reply database operation or body read failed'),
      { route: '/api/webhooks/instantly' }
    );
    return json({ error: 'Reply capture failed' }, 500);
  }
}
