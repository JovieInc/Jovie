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
      let value: string;
      try {
        value = decodeURIComponent(rest.join('='));
      } catch {
        // A malformed escape (%E0%A4%A) must not fail the waitlist submit.
        return null;
      }
      return isAcquisitionJourneyId(value) ? value : null;
    }
  }
  return null;
}

export async function recordWaitlistJoin(params: {
  readonly entryId: string;
  readonly acquisitionId: string | null | undefined;
  readonly admitted: boolean;
  /** Session user (app users.id); the journey must be unlinked or theirs. */
  readonly appUserId: string;
}): Promise<void> {
  const { entryId, acquisitionId, admitted, appUserId } = params;
  if (!isAcquisitionJourneyId(acquisitionId)) return;
  try {
    // Lazy: the registered admission module pulls in auth and claim code.
    const { stampWaitlistAcquisitionId } = await import(
      '@/lib/waitlist/approval'
    );
    const owned = await stampWaitlistAcquisitionId(
      entryId,
      acquisitionId,
      appUserId
    );
    // Someone else's or a revoked journey: record nothing against it.
    if (!owned) return;
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
