import { sql as drizzleSql } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { stageForFunnelPath } from '@/lib/acquisition/artist-offer-funnel';
import { recordArtistOfferStage } from '@/lib/acquisition/artist-offer-funnel.server';
import {
  FIRST_TOUCH_COOKIE,
  openFirstTouchEnvelope,
} from '@/lib/acquisition/first-touch-envelope';
import { toReceiptFirstTouch } from '@/lib/acquisition/first-touch-receipt';
import { upsertAndLinkJourney } from '@/lib/acquisition/journey-link';
import { isSyntheticTraffic } from '@/lib/acquisition/synthetic-traffic';
import { getCachedAuth } from '@/lib/auth/cached';
import { db } from '@/lib/db';
import { runAtomicDbOperation } from '@/lib/db/legacy-transaction';
import { isVisualCaptureSyntheticAuthEnabled } from '@/lib/e2e/runtime';

export const runtime = 'nodejs';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const captureSchema = z.object({
  action: z.literal('capture').optional(),
  acquisitionId: z.string().uuid(),
  capturedAt: z.string().datetime(),
  /** Current pathname; a funnel page view (e.g. /pricing) records its stage. */
  currentPath: z.string().max(2000).optional(),
  firstTouch: z
    .object({
      source: z.string().max(200).optional(),
      medium: z.string().max(200).optional(),
      campaign: z.string().max(200).optional(),
      term: z.string().max(200).optional(),
      content: z.string().max(200).optional(),
      referrer: z.string().max(2000).optional(),
      landingPath: z.string().max(2000).optional(),
      claimId: z.string().max(128).optional(),
      runId: z.string().max(128).optional(),
      candidateId: z.string().max(128).optional(),
      offerVersion: z.string().max(128).optional(),
    })
    .strict(),
});
const revokeSchema = z.object({
  action: z.literal('revoke'),
  acquisitionId: z.string().uuid(),
});
const requestSchema = z.union([captureSchema, revokeSchema]);

const ANONYMOUS_ACTOR_ID = 'system:acquisition-capture';

/**
 * Persist first touch and, when authenticated, link exactly that browser
 * journey and its events to the app user in one SQL statement. The guards
 * prevent one acquisition id from being reassigned across users.
 */
export async function POST(request: NextRequest) {
  const parsed = requestSchema.safeParse(
    await request.json().catch(() => null)
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid acquisition evidence' },
      { status: 400 }
    );
  }

  // Secretless PR visual capture has no database. Keep the render probe
  // deterministic without claiming that acquisition evidence was persisted.
  if (isVisualCaptureSyntheticAuthEnabled()) {
    return NextResponse.json({ recorded: false, linked: false });
  }

  const envelope = await openFirstTouchEnvelope(
    request.cookies.get(FIRST_TOUCH_COOKIE)?.value
  );
  const signed = envelope?.agentIntent ? envelope : null;
  if (parsed.data.action === 'revoke') {
    await db.execute(drizzleSql`
      UPDATE acquisition_journeys
      SET consent_state = 'revoked', consent_revoked_at = now(), updated_at = now()
      WHERE id = ${signed?.id ?? parsed.data.acquisitionId}::uuid
        AND consent_revoked_at IS NULL
    `);
    return NextResponse.json({ recorded: true, linked: false });
  }

  // `getCachedAuth().userId` is the app `users.id` UUID, not the Better Auth
  // id. Matching it against `users.better_auth_user_id` linked 0 of 28,156
  // production journeys in 30 days, so the sign-in stage always read 0.
  const { userId: authUserId } = await getCachedAuth();
  const appUserId =
    typeof authUserId === 'string' && UUID_PATTERN.test(authUserId)
      ? authUserId
      : null;
  // Agent fields never come from a request body or unsigned query parameters.
  const acquisitionId = signed?.id ?? parsed.data.acquisitionId;
  const capturedAt = signed
    ? new Date(signed.iat).toISOString()
    : parsed.data.capturedAt;
  const firstTouchJson = JSON.stringify({
    ...(signed ? toReceiptFirstTouch(signed) : parsed.data.firstTouch),
    ...(isSyntheticTraffic(request.headers) ? { synthetic: true } : {}),
  });

  // One transaction: the upsert and the user link must both commit (they are
  // separate statements; see lib/acquisition/journey-link.ts).
  const linked = await runAtomicDbOperation(
    tx =>
      upsertAndLinkJourney(tx, {
        acquisitionId,
        firstTouchJson,
        capturedAt: new Date(capturedAt),
        appUserId,
      }),
    // Never a request-derived value (legacy-transaction.ts actor contract).
    { actorId: ANONYMOUS_ACTOR_ID, system: true, retry: 'never' }
  );

  const funnelStage = stageForFunnelPath(parsed.data.currentPath);
  if (funnelStage) {
    await recordArtistOfferStage(acquisitionId, funnelStage);
  }

  return NextResponse.json({
    recorded: true,
    linked,
    acquisitionId,
  });
}
