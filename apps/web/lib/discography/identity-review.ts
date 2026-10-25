import 'server-only';

import { sql as drizzleSql } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  classifyPublication,
  type DecisionRate,
  describeProvenance,
  type PublicationCandidate,
  type PublicationReason,
  providerAlbumIdOf,
} from './publication-eligibility';

/**
 * "Is this you?" review for provider-ingested releases the importer was not
 * confident about. Pending = approval `needs_review` with no recorded decision.
 * Accept publishes and records; Reject hides (archived) and records, keyed by
 * provider album id so it is never re-imported or re-asked.
 */

export type IdentityDecision = 'accepted' | 'rejected';

export interface PendingIdentityReview {
  readonly releaseId: string;
  readonly reason: PublicationReason;
  readonly provenance: string;
}

type ReleaseRow = {
  id: string;
  title: string;
  release_date: Date | null;
  metadata: unknown;
  approval: string | null;
  source_type: string | null;
};

const decisionKey = (releaseId: string, metadata: unknown) =>
  providerAlbumIdOf(metadata) ?? `release:${releaseId}`;

async function loadProfileReleases(creatorProfileId: string) {
  const result = await db.execute<ReleaseRow>(drizzleSql`
    SELECT r.id, r.title, r.release_date, r.metadata, r.source_type,
      a.approval_status::text AS approval
    FROM discog_releases r
    LEFT JOIN library_asset_approval_statuses a
      ON a.asset_id = r.id::text AND a.creator_profile_id = r.creator_profile_id
    WHERE r.creator_profile_id = ${creatorProfileId} AND r.deleted_at IS NULL
  `);
  return result.rows.map(r => ({
    row: r,
    candidate: {
      id: r.id,
      title: r.title,
      releaseDate: r.release_date ? new Date(r.release_date) : null,
      metadata: r.metadata,
    } satisfies PublicationCandidate,
  }));
}

/** Provider album ids (or release keys) with a recorded decision. */
export async function getDecidedKeys(
  creatorProfileId: string,
  decision?: IdentityDecision
): Promise<Set<string>> {
  const result = await db.execute<{ provider_album_id: string }>(drizzleSql`
    SELECT provider_album_id FROM release_identity_decisions
    WHERE creator_profile_id = ${creatorProfileId}
      ${decision ? drizzleSql`AND decision = ${decision}` : drizzleSql``}
  `);
  return new Set(result.rows.map(r => r.provider_album_id));
}

export async function loadPendingIdentityReviews(
  creatorProfileId: string,
  ownerSpotifyId: string | null
): Promise<Map<string, PendingIdentityReview>> {
  const [releases, decided] = await Promise.all([
    loadProfileReleases(creatorProfileId),
    getDecidedKeys(creatorProfileId),
  ]);
  const all = releases.map(r => r.candidate);
  const pending = new Map<string, PendingIdentityReview>();
  for (const { row, candidate } of releases) {
    if (row.approval !== 'needs_review' || row.source_type !== 'ingested') {
      continue;
    }
    if (decided.has(decisionKey(row.id, row.metadata))) continue;
    const { reason } = classifyPublication(candidate, all, ownerSpotifyId);
    pending.set(row.id, {
      releaseId: row.id,
      reason,
      provenance: describeProvenance(candidate, reason),
    });
  }
  return pending;
}

/**
 * Record the artist's answer. Accept publishes (approved + visible); Reject
 * hides (archived). Verifies the release belongs to the profile.
 */
export async function recordIdentityDecision(input: {
  creatorProfileId: string;
  releaseId: string;
  decision: IdentityDecision;
  decidedBy: string | null;
  ownerSpotifyId: string | null;
}): Promise<{ ok: boolean }> {
  const releases = await loadProfileReleases(input.creatorProfileId);
  const target = releases.find(r => r.row.id === input.releaseId);
  if (!target) return { ok: false };

  const { reason } = classifyPublication(
    target.candidate,
    releases.map(r => r.candidate),
    input.ownerSpotifyId
  );
  const key = decisionKey(input.releaseId, target.row.metadata);

  await db.execute(drizzleSql`
    INSERT INTO release_identity_decisions
      (creator_profile_id, provider_album_id, release_id, decision, reason, decided_by)
    VALUES (${input.creatorProfileId}, ${key}, ${input.releaseId},
      ${input.decision}, ${reason}, ${input.decidedBy})
    ON CONFLICT (creator_profile_id, provider_album_id)
    DO UPDATE SET decision = EXCLUDED.decision, decided_at = now(),
      decided_by = EXCLUDED.decided_by, release_id = EXCLUDED.release_id`);

  const status = input.decision === 'accepted' ? 'approved' : 'archived';
  await db.execute(drizzleSql`
    INSERT INTO library_asset_approval_statuses
      (creator_profile_id, asset_id, item_kind, approval_status, profile_visibility)
    VALUES (${input.creatorProfileId}, ${input.releaseId}, 'release', ${status}, 'visible')
    ON CONFLICT (creator_profile_id, asset_id)
    DO UPDATE SET approval_status = EXCLUDED.approval_status, updated_at = now()`);
  return { ok: true };
}

/** Accept/reject counts per reason: the measurement behind the threshold. */
export async function getIdentityDecisionRates(): Promise<DecisionRate[]> {
  const result = await db.execute<{
    reason: string;
    accepted: number;
    rejected: number;
  }>(drizzleSql`
    SELECT reason,
      count(*) FILTER (WHERE decision = 'accepted')::int AS accepted,
      count(*) FILTER (WHERE decision = 'rejected')::int AS rejected
    FROM release_identity_decisions GROUP BY reason ORDER BY reason`);
  return result.rows;
}
