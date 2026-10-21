import 'server-only';

import { sql as drizzleSql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { captureError } from '@/lib/error-tracking';
import {
  type ArtistOfferFunnelReport,
  type ArtistOfferJourneyTimeline,
  buildArtistOfferFunnelReport,
  isRecordedArtistOfferStage,
  type RecordedArtistOfferStage,
} from './artist-offer-funnel';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEFAULT_WINDOW_MS = 28 * 24 * 60 * 60 * 1000;
const MAX_TIMELINES = 50_000;

export function isAcquisitionJourneyId(
  value: string | null | undefined
): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

/**
 * Record the first occurrence of a funnel stage for a consented journey.
 *
 * Measurement only: it never throws and never blocks the business path that
 * calls it. A missing or malformed journey id (no analytics consent) records
 * nothing. A revoked journey is never resurrected.
 */
export async function recordArtistOfferStage(
  acquisitionId: string | null | undefined,
  stage: RecordedArtistOfferStage,
  occurredAt: Date = new Date()
): Promise<boolean> {
  if (!isAcquisitionJourneyId(acquisitionId)) return false;
  if (!isRecordedArtistOfferStage(stage)) return false;

  try {
    await db.execute(drizzleSql`
      WITH journey AS (
        INSERT INTO acquisition_journeys (
          id, first_touch, consent_state, captured_at, updated_at
        ) VALUES (
          ${acquisitionId}::uuid, '{}'::jsonb, 'analytics_allowed', ${occurredAt}, now()
        )
        ON CONFLICT (id) DO NOTHING
        RETURNING id
      ), eligible AS (
        SELECT id FROM journey
        UNION
        SELECT id FROM acquisition_journeys
        WHERE id = ${acquisitionId}::uuid AND consent_revoked_at IS NULL
      )
      INSERT INTO acquisition_journey_stages (acquisition_id, stage, occurred_at)
      SELECT id, ${stage}, ${occurredAt} FROM eligible
      ON CONFLICT (acquisition_id, stage) DO NOTHING
    `);
    return true;
  } catch (error) {
    await captureError('Failed to record artist-offer funnel stage', error, {
      route: 'lib/acquisition/artist-offer-funnel.server',
      contextData: { stage },
    });
    return false;
  }
}

interface TimelineRow extends Record<string, unknown> {
  readonly visit: string | Date | null;
  readonly sign_in: string | Date | null;
  readonly stages: Record<string, string> | null;
}

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function rowsOf<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  const rows = (result as { rows?: unknown } | null)?.rows;
  return Array.isArray(rows) ? (rows as T[]) : [];
}

/**
 * Stage counts, step conversion and p50/p95 timings over consented journeys
 * first seen in the window (default: trailing 28 days).
 */
export async function getArtistOfferFunnelReport(input?: {
  readonly start?: Date;
  readonly end?: Date;
}): Promise<ArtistOfferFunnelReport> {
  const end = input?.end ?? new Date();
  const start = input?.start ?? new Date(end.getTime() - DEFAULT_WINDOW_MS);

  const visitResult = await db.execute(drizzleSql`
    SELECT count(*)::int AS visits
    FROM acquisition_journeys
    WHERE captured_at >= ${start} AND captured_at < ${end}
      AND consent_revoked_at IS NULL
  `);
  const totalVisits = Number(
    rowsOf<{ visits: number }>(visitResult)[0]?.visits ?? 0
  );

  const timelineResult = await db.execute(drizzleSql`
    SELECT j.captured_at AS visit,
           j.linked_at AS sign_in,
           jsonb_object_agg(s.stage, s.occurred_at) AS stages
    FROM acquisition_journeys j
    INNER JOIN acquisition_journey_stages s ON s.acquisition_id = j.id
    WHERE j.captured_at >= ${start} AND j.captured_at < ${end}
      AND j.consent_revoked_at IS NULL
    GROUP BY j.id, j.captured_at, j.linked_at
    LIMIT ${MAX_TIMELINES}
  `);

  const timelines: ArtistOfferJourneyTimeline[] = rowsOf<TimelineRow>(
    timelineResult
  ).map(row => ({
    visit: toDate(row.visit),
    pricing: toDate(row.stages?.pricing),
    'claim-start': toDate(row.stages?.['claim-start']),
    'sign-in': toDate(row.sign_in),
    checkout: toDate(row.stages?.checkout),
    paid: toDate(row.stages?.paid),
    'profile-live': toDate(row.stages?.['profile-live']),
    'pending-verification': toDate(row.stages?.['pending-verification']),
  }));

  return buildArtistOfferFunnelReport({ start, end, totalVisits, timelines });
}
