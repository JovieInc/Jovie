import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import {
  type OperatorRouteInput,
  operatorAccess,
} from '@/lib/api/route-access';
import { defineRoute } from '@/lib/api/route-pipeline';
import { db } from '@/lib/db';
import { leads } from '@/lib/db/schema/leads';
import { captureError, getSafeErrorMessage } from '@/lib/error-tracking';
import { recordLeadFunnelEvent } from '@/lib/leads/funnel-events';
import { resolveLeadClaimToken } from '@/lib/leads/lead-claim-token';
import { evaluateOutboundHistoryRecord } from '@/lib/outbound/approval';
import {
  outboundTargetFromLead,
  readOutboundLedger,
} from '@/lib/outbound/ledger.server';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

export const runtime = 'nodejs';

/**
 * PATCH /api/admin/leads/[id]/dm-sent — Mark a DM as sent.
 */
async function patchHandler(
  _input: OperatorRouteInput,
  { params }: { params: Promise<{ id: string }> }
) {
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
        // Read by the existing-relationship hold (management credits in bio).
        bio: leads.bio,
        claimTokenHash: leads.claimTokenHash,
        claimTokenExpiresAt: leads.claimTokenExpiresAt,
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

    // This records operator-reported history; it does not deliver a DM.
    // Preserve the existing exact-copy review requirement for this local action.
    const ledger = await readOutboundLedger([existingLead.id]);
    const permission = evaluateOutboundHistoryRecord({
      target: outboundTargetFromLead({
        ...existingLead,
        claimToken: await resolveLeadClaimToken({
          id: existingLead.id,
          claimTokenHash: existingLead.claimTokenHash,
          claimTokenExpiresAt: existingLead.claimTokenExpiresAt,
        }),
      }),
      channel: 'dm',
      rows: ledger.get(existingLead.id) ?? [],
    });
    if (!permission.historyRecordAllowed) {
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
        metadata: {
          approvedCopyRevision: permission.copy.revision,
          recordingSource: 'operator_reported',
          deliveryVerified: false,
        },
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

export const PATCH = defineRoute(
  {
    route: '/api/admin/leads/[id]/dm-sent',
    access: operatorAccess({ session: 'fresh' }),
    legacy: { cache: 'pipeline-responses-only', unhandledErrors: 'rethrow' },
  },
  patchHandler
);
