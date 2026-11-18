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
    const result = await refreshLeadProfileEvidence(
      lead.creatorProfileId,
      lead
    );
    // A non-2xx response keeps existing callers from reporting a successful
    // refresh when only part (or none) of the requested work was accepted.
    // Accepted jobs may still be running: this is not certification evidence.
    if (result.status !== 'accepted') {
      const error =
        result.status === 'no_source'
          ? 'No Spotify artist source is available for enrichment. Surface reconciliation completed.'
          : result.status === 'partial'
            ? 'Evidence refresh was only partly accepted. Some work may have started; check the reported outcomes before retrying.'
            : 'Evidence refresh failed. No enrichment job was acknowledged.';
      return NextResponse.json(
        { ok: false, ...result, error },
        {
          // The shared fetch client preserves 4xx bodies, so partial receipts
          // remain available to callers instead of becoming a generic 5xx.
          status:
            result.status === 'no_source'
              ? 422
              : result.status === 'partial'
                ? 409
                : 503,
          headers: NO_STORE_HEADERS,
        }
      );
    }
    return NextResponse.json(
      { ok: true, ...result },
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
