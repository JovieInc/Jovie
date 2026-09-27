import { sql as drizzleSql } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCachedAuth } from '@/lib/auth/cached';
import { db } from '@/lib/db';
import { isVisualCaptureSyntheticAuthEnabled } from '@/lib/e2e/runtime';

export const runtime = 'nodejs';

const captureSchema = z.object({
  action: z.literal('capture').optional(),
  acquisitionId: z.string().uuid(),
  capturedAt: z.string().datetime(),
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

  if (parsed.data.action === 'revoke') {
    await db.execute(drizzleSql`
      UPDATE acquisition_journeys
      SET consent_state = 'revoked', consent_revoked_at = now(), updated_at = now()
      WHERE id = ${parsed.data.acquisitionId}::uuid
        AND consent_revoked_at IS NULL
    `);
    return NextResponse.json({ recorded: true, linked: false });
  }

  const { userId: authUserId } = await getCachedAuth();
  const { acquisitionId, firstTouch, capturedAt } = parsed.data;
  const firstTouchJson = JSON.stringify(firstTouch);

  await db.execute(drizzleSql`
    WITH app_user AS (
      SELECT id FROM users
      WHERE better_auth_user_id = ${authUserId ?? ''}
      LIMIT 1
    ), upserted AS (
      INSERT INTO acquisition_journeys (
        id, first_touch, consent_state, captured_at, updated_at
      ) VALUES (
        ${acquisitionId}::uuid,
        ${firstTouchJson}::jsonb,
        'analytics_allowed',
        ${new Date(capturedAt)},
        now()
      )
      ON CONFLICT (id) DO UPDATE SET
        first_touch = CASE
          WHEN acquisition_journeys.first_touch = '{}'::jsonb
            THEN EXCLUDED.first_touch
          ELSE acquisition_journeys.first_touch
        END,
        updated_at = now()
      RETURNING id
    ), claimed AS (
      UPDATE acquisition_journeys AS journey
      SET user_id = app_user.id, linked_at = now(), updated_at = now()
      FROM app_user, upserted
      WHERE journey.id = upserted.id
        AND (journey.user_id IS NULL OR journey.user_id = app_user.id)
        AND NOT EXISTS (
          SELECT 1 FROM acquisition_journeys existing
          WHERE existing.user_id = app_user.id
            AND existing.id <> journey.id
        )
      RETURNING journey.id, journey.user_id
    )
    UPDATE pixel_events AS pe
    SET user_id = claimed.user_id
    FROM claimed
    WHERE pe.acquisition_id = claimed.id
      AND pe.user_id IS NULL
  `);

  return NextResponse.json({ recorded: true, linked: Boolean(authUserId) });
}
