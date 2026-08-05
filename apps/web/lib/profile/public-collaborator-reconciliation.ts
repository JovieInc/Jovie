import { after } from 'next/server';
import type { StructuredReleaseCollaborator } from '@/lib/discography/artist-queries';
import { reconcileCreditedArtistProfiles } from '@/lib/discography/collaborator-profile-reconciliation';
import { captureWarning } from '@/lib/error-tracking';

interface SchedulePublicCollaboratorReconciliationInput {
  readonly creatorProfileId: string;
  readonly ownerSpotifyId: string | null;
  readonly collaborators: readonly StructuredReleaseCollaborator[];
}

const RECONCILIATION_CONTEXT = {
  source: 'public_profile_render',
  route: '/[username]',
} as const;

/**
 * Repair legacy catalogs after a public render observes a structured credit
 * with no public profile binding. The render never waits for this work: the
 * existing importer/backfill remains authoritative, while `after()` provides
 * a bounded self-healing path for older catalogs that predate reconciliation.
 */
export function schedulePublicCollaboratorProfileReconciliation({
  creatorProfileId,
  ownerSpotifyId,
  collaborators,
}: SchedulePublicCollaboratorReconciliationInput): boolean {
  // `generateStaticParams` prerenders public profiles during the production
  // build. Do not mutate production data from that build-time render; the
  // importer/backfill owns static-generation repair, while runtime ISR renders
  // can safely use the request-scoped `after()` lifecycle below.
  if (process.env.NEXT_PHASE === 'phase-production-build') return false;

  if (
    !ownerSpotifyId ||
    !collaborators.some(
      collaborator =>
        collaborator.profileState === 'unavailable' &&
        collaborator.reconciliationEligible === true
    )
  ) {
    return false;
  }

  try {
    after(() =>
      reconcileCreditedArtistProfiles(creatorProfileId, ownerSpotifyId)
        .then(result => {
          if (result.created > 0 || result.reused > 0) return;

          if (result.conflicted > 0 || result.metadataUnavailable > 0) {
            return captureWarning(
              'Public collaborator profile reconciliation completed without a link',
              undefined,
              {
                ...RECONCILIATION_CONTEXT,
                creatorProfileId,
                ...result,
              }
            );
          }
        })
        .catch(error =>
          captureWarning(
            'Public collaborator profile reconciliation failed',
            error,
            { ...RECONCILIATION_CONTEXT, creatorProfileId }
          )
        )
    );
    return true;
  } catch {
    // Static generation and non-request callers do not have an `after()`
    // lifecycle. The importer/backfill still owns those paths; never fail a
    // public profile render because a best-effort repair could not be queued.
    return false;
  }
}
