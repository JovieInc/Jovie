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
import { refreshLeadProfileEvidence } from '@/lib/leads/ingest-lead';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

export const runtime = 'nodejs';

/**
 * POST /api/admin/leads/[id]/refresh-evidence — re-collect the evidence a
 * lead-built profile needs for certification (surfaces + DSP enrichment).
 * Reads public data only; sends nothing to the artist (JOV-7855).
 */
async function postHandler(
  _input: OperatorRouteInput,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const [lead] = await db
      .select({
        id: leads.id,
        spotifyUrl: leads.spotifyUrl,
        creatorProfileId: leads.creatorProfileId,
      })
      .from(leads)
      .where(eq(leads.id, id))
      .limit(1);
    if (!lead)
      return NextResponse.json(
        { error: 'Lead not found' },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    if (!lead.creatorProfileId)
      return NextResponse.json(
        { error: 'Build the profile first' },
        { status: 409, headers: NO_STORE_HEADERS }
      );
    const queued = await refreshLeadProfileEvidence(
      lead.creatorProfileId,
      lead
    );
    return NextResponse.json(
      { ok: true, ...queued },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    await captureError('Lead evidence refresh failed', error, {
      route: '/api/admin/leads/[id]/refresh-evidence',
      contextData: { id },
    });
    return NextResponse.json(
      { error: getSafeErrorMessage(error, 'Evidence refresh failed') },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

export const POST = defineRoute(
  {
    route: '/api/admin/leads/[id]/refresh-evidence',
    access: operatorAccess({ session: 'fresh' }),
    legacy: { cache: 'pipeline-responses-only', unhandledErrors: 'rethrow' },
  },
  postHandler
);
