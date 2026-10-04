import { eq } from 'drizzle-orm';
import { type NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { leads } from '@/lib/db/schema/leads';
import { captureError, getSafeErrorMessage } from '@/lib/error-tracking';
import { recordLeadFunnelEvent } from '@/lib/leads/funnel-events';
import { evaluateOutboundSend } from '@/lib/outbound/approval';
import {
  outboundTargetFromLead,
  readOutboundLedger,
} from '@/lib/outbound/ledger.server';
import { getOvieOperatorEntitlements } from '@/lib/ovie/privacy-lock/access';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

export const runtime = 'nodejs';

/**
 * PATCH /api/admin/leads/[id]/dm-sent — Mark a DM as sent.
 */
export async function PATCH(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const entitlements = await getOvieOperatorEntitlements({ session: 'fresh' });
  if (!entitlements.isAuthenticated) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401, headers: NO_STORE_HEADERS }
    );
  }
  if (!entitlements.isAdmin) {
    return NextResponse.json(
      { error: 'Forbidden' },
      { status: 403, headers: NO_STORE_HEADERS }
    );
  }

  try {
    const { id } = await params;
    const now = new Date();
    const [existingLead] = await db
      .select({
        id: leads.id,
        firstContactedAt: leads.firstContactedAt,
        linktreeHandle: leads.linktreeHandle,
        displayName: leads.displayName,
        contactEmail: leads.contactEmail,
        instagramHandle: leads.instagramHandle,
        creatorProfileId: leads.creatorProfileId,
        claimToken: leads.claimToken,
      })
      .from(leads)
      .where(eq(leads.id, id))
      .limit(1);

    if (!existingLead) {
      return NextResponse.json(
        { error: 'Lead not found' },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }

    // A DM may only be recorded as sent for the exact copy Tim approved.
    const ledger = await readOutboundLedger([existingLead.id]);
    const permission = evaluateOutboundSend({
      target: outboundTargetFromLead(existingLead),
      channel: 'dm',
      rows: ledger.get(existingLead.id) ?? [],
    });
    if (!permission.allowed) {
      return NextResponse.json(
        { error: 'Outreach not approved', reason: permission.reason },
        { status: 409, headers: NO_STORE_HEADERS }
      );
    }

    const [updated] = await db
      .update(leads)
      .set({
        dmSentAt: now,
        outreachStatus: 'dm_sent',
        firstContactedAt: existingLead.firstContactedAt ?? now,
        lastContactedAt: now,
        updatedAt: now,
      })
      .where(eq(leads.id, id))
      .returning();

    await recordLeadFunnelEvent(
      {
        leadId: id,
        eventType: 'dm_sent',
        channel: 'dm',
        campaignKey: 'claim_invite',
        metadata: { approvedCopyRevision: permission.copy.revision },
      },
      { idempotent: true }
    );

    return NextResponse.json(updated, {
      status: 200,
      headers: NO_STORE_HEADERS,
    });
  } catch (error) {
    const { id } = await params;
    await captureError('Failed to mark DM as sent', error, {
      route: '/api/admin/leads/[id]/dm-sent',
      contextData: { id },
    });
    return NextResponse.json(
      { error: getSafeErrorMessage(error, 'Failed to mark DM as sent') },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
