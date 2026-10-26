import { sql as drizzleSql } from 'drizzle-orm';

/** Anything with drizzle's execute: the db, or a transaction. */
export interface JourneySqlExecutor {
  execute(query: ReturnType<typeof drizzleSql>): PromiseLike<unknown>;
}

export interface JourneyLinkParams {
  readonly acquisitionId: string;
  readonly firstTouchJson: string;
  readonly capturedAt: Date;
  /** App users.id UUID, or null for an anonymous visit. */
  readonly appUserId: string | null;
}

/**
 * Upsert the journey, then link it to the signed-in user. These are separate
 * statements on purpose: as sibling data-modifying CTEs in one statement they
 * share a snapshot, so the link UPDATE never saw the row the upsert wrote and
 * 0 of 28,349 prod journeys were ever linked. Call inside one transaction.
 */
export async function upsertAndLinkJourney(
  executor: JourneySqlExecutor,
  p: JourneyLinkParams
): Promise<void> {
  await executor.execute(drizzleSql`
    INSERT INTO acquisition_journeys (
      id, first_touch, consent_state, captured_at, updated_at
    ) VALUES (
      ${p.acquisitionId}::uuid,
      ${p.firstTouchJson}::jsonb,
      'analytics_allowed',
      ${p.capturedAt},
      now()
    )
    ON CONFLICT (id) DO UPDATE SET
      first_touch = CASE
        WHEN acquisition_journeys.first_touch = '{}'::jsonb
          THEN EXCLUDED.first_touch
        ELSE acquisition_journeys.first_touch
      END,
      updated_at = now()
  `);
  if (!p.appUserId) return;

  await executor.execute(drizzleSql`
    UPDATE acquisition_journeys AS journey
    SET user_id = app_user.id, linked_at = now(), updated_at = now()
    FROM (SELECT id FROM users WHERE id = ${p.appUserId}::uuid LIMIT 1) AS app_user
    WHERE journey.id = ${p.acquisitionId}::uuid
      AND (journey.user_id IS NULL OR journey.user_id = app_user.id)
      AND NOT EXISTS (
        SELECT 1 FROM acquisition_journeys existing
        WHERE existing.user_id = app_user.id
          AND existing.id <> journey.id
      )
  `);
  await executor.execute(drizzleSql`
    UPDATE pixel_events AS pe
    SET user_id = journey.user_id
    FROM acquisition_journeys AS journey
    WHERE journey.id = ${p.acquisitionId}::uuid
      AND journey.user_id = ${p.appUserId}::uuid
      AND pe.acquisition_id = journey.id
      AND pe.user_id IS NULL
  `);
}
