import 'server-only';

import { sql as drizzleSql } from 'drizzle-orm';
import {
  isAcquisitionJourneyId,
  recordArtistOfferStage,
} from '@/lib/acquisition/artist-offer-funnel.server';
import { db } from '@/lib/db';
import { captureError } from '@/lib/error-tracking';
import { ACQUISITION_COOKIE_NAME } from '@/lib/tracking/consent';

/**
 * Waitlist -> admit attribution (growth spine). The acquisition journey id
 * from the consented browser cookie is stored on the entry's
 * qualification_inputs (no schema change), `waitlist-join` is recorded at
 * submit and `admitted` when the entry is let in, so loop -> waitlist ->
 * admit -> paid reads off one journey. Measurement only: never throws.
 */

export function acquisitionIdFromCookieHeader(
  header: string | null | undefined
): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === ACQUISITION_COOKIE_NAME) {
      const value = decodeURIComponent(rest.join('='));
      return isAcquisitionJourneyId(value) ? value : null;
    }
  }
  return null;
}

export async function recordWaitlistJoin(params: {
  readonly entryId: string;
  readonly acquisitionId: string | null | undefined;
  readonly admitted: boolean;
}): Promise<void> {
  const { entryId, acquisitionId, admitted } = params;
  if (!isAcquisitionJourneyId(acquisitionId)) return;
  try {
    await db.execute(drizzleSql`
      UPDATE waitlist_entries
      SET qualification_inputs =
        COALESCE(qualification_inputs, '{}'::jsonb)
        || jsonb_build_object('acquisitionId', ${acquisitionId}::text)
      WHERE id = ${entryId}::uuid
        AND NOT (COALESCE(qualification_inputs, '{}'::jsonb) ? 'acquisitionId')
    `);
    await recordArtistOfferStage(acquisitionId, 'waitlist-join');
    if (admitted) await recordArtistOfferStage(acquisitionId, 'admitted');
  } catch (error) {
    await captureError('Failed to record waitlist join stage', error, {
      route: 'lib/waitlist/acquisition-stages',
    });
  }
}

/** Call after an approval commits. Looks up the journey stored at join. */
export async function recordAdmittedForEntry(entryId: string): Promise<void> {
  try {
    const result = await db.execute<{ acquisition_id: string | null }>(
      drizzleSql`
        SELECT qualification_inputs->>'acquisitionId' AS acquisition_id
        FROM waitlist_entries
        WHERE id = ${entryId}::uuid
      `
    );
    await recordArtistOfferStage(result.rows[0]?.acquisition_id, 'admitted');
  } catch (error) {
    await captureError('Failed to record admitted stage', error, {
      route: 'lib/waitlist/acquisition-stages',
    });
  }
}
