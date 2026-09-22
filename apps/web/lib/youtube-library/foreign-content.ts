/**
 * Foreign-content detection for an artist's YouTube channel surface.
 *
 * An Official Artist Channel can aggregate uploads from linked channels
 * (personal channel, VEVO channel, topic channel). When a same-name artist's
 * release is misdelivered onto one of those linked channels, the foreign
 * upload appears on the artist's channel surface and siphons traffic.
 *
 * This module identifies review candidates from supplied provider data. It is intentionally
 * pure and read-only: guidance is provided by the playbook
 * (`foreign-content-playbook.ts`) and requires explicit owner review before
 * anything is submitted to YouTube.
 */

/** Routing hints for suspected mismatches; none establishes release ownership. */
export type ForeignContentClassification =
  /** Candidate on a supplied linked channel; requires release identity review. */
  | 'foreign_upload_on_linked_channel'
  /** Candidate outside supplied channel lists, which may be incomplete. */
  | 'wrong_release_attribution'
  /** Flagged upload on an artist-controlled channel; recording ownership is unknown. */
  | 'owned_unwanted';

/** One video visible on the artist's channel surface, with its true owner. */
export interface ChannelSurfaceVideo {
  readonly videoId: string;
  /** Channel that actually owns the upload (from the provider). */
  readonly owningChannelId: string;
  readonly owningChannelTitle: string | null;
  readonly title: string;
}

export interface ForeignContentCase {
  /**
   * Stable key for deduplication within one scan. No persistence or request
   * idempotency is provided by this pure module.
   */
  readonly caseKey: string;
  readonly videoId: string;
  readonly title: string;
  readonly owningChannelId: string;
  readonly owningChannelTitle: string | null;
  readonly classification: ForeignContentClassification;
  /** Channel relationships and catalog absence never confirm identity. */
  readonly status: 'needs_owner_review';
  /** Conflicting catalog membership and owner flag must be reconciled first. */
  readonly catalogConflict: boolean;
  /** Human-readable evidence line for review surfaces and audit logs. */
  readonly evidence: string;
}

export interface DetectForeignContentInput {
  /** Channels the artist owns (personal channel, topic channel, etc.). */
  readonly ownedChannelIds: readonly string[];
  /**
   * Channels linked into the artist's OAC that the artist does not directly
   * control (e.g. a VEVO channel operated by a label/distributor). Uploads
   * from these aggregate onto the artist's channel surface.
   */
  readonly linkedChannelIds?: readonly string[];
  /** Every video visible on the artist's channel surface. */
  readonly surfaceVideos: readonly ChannelSurfaceVideo[];
  /**
   * Video IDs the artist explicitly flagged as not theirs. Anything listed
   * here that is owned by one of the artist's own channels classifies as
   * `owned_unwanted`; the rest classify by owning channel as usual.
   */
  readonly flaggedForeignVideoIds?: readonly string[];
  /**
   * The artist's verified catalog at release/video level: owned uploads,
   * topic-channel cross-checks, and distributor/ISRC-verified video IDs.
   * Membership here exempts an unflagged video - a misdelivery onto a
   * legitimate linked channel (e.g. a legacy VEVO channel that mostly
   * carries the artist's catalog) can only be caught by checking each
   * release against this catalog, never by channel-level exclusion.
   */
  readonly verifiedCatalogVideoIds?: readonly string[];
}

export function detectForeignContent(
  input: DetectForeignContentInput
): ForeignContentCase[] {
  const owned = new Set(input.ownedChannelIds);
  const linked = new Set(input.linkedChannelIds ?? []);
  const flagged = new Set(input.flaggedForeignVideoIds ?? []);
  const verifiedCatalog = new Set(input.verifiedCatalogVideoIds ?? []);
  const cases: ForeignContentCase[] = [];
  const seen = new Set<string>();

  for (const video of input.surfaceVideos) {
    if (!video.videoId || !video.owningChannelId) {
      continue;
    }
    const caseKey = `${video.owningChannelId}:${video.videoId}`;
    if (seen.has(caseKey)) {
      continue;
    }

    // An explicit flag conflicting with the catalog must remain visible.
    if (verifiedCatalog.has(video.videoId) && !flagged.has(video.videoId)) {
      continue;
    }

    let classification: ForeignContentClassification | null = null;
    if (owned.has(video.owningChannelId)) {
      // Owned uploads are only a case when the artist flagged them.
      if (flagged.has(video.videoId)) {
        classification = 'owned_unwanted';
      }
    } else if (linked.has(video.owningChannelId)) {
      classification = 'foreign_upload_on_linked_channel';
    } else {
      classification = 'wrong_release_attribution';
    }

    if (classification === null) {
      continue;
    }
    seen.add(caseKey);
    cases.push({
      caseKey,
      videoId: video.videoId,
      title: video.title,
      owningChannelId: video.owningChannelId,
      owningChannelTitle: video.owningChannelTitle,
      classification,
      status: 'needs_owner_review',
      catalogConflict: verifiedCatalog.has(video.videoId),
      evidence: verifiedCatalog.has(video.videoId)
        ? `${buildEvidence(video, classification)} Owner flag conflicts with verified catalog membership; reconcile release identity before any request.`
        : buildEvidence(video, classification),
    });
  }

  return cases;
}

function buildEvidence(
  video: ChannelSurfaceVideo,
  classification: ForeignContentClassification
): string {
  const owner = video.owningChannelTitle
    ? `${video.owningChannelTitle} (${video.owningChannelId})`
    : video.owningChannelId;
  switch (classification) {
    case 'foreign_upload_on_linked_channel':
      return `"${video.title}" (${video.videoId}) is uploaded by linked channel ${owner}, not by the artist's own channels.`;
    case 'wrong_release_attribution':
      return `"${video.title}" (${video.videoId}) appears on the artist's channel but is uploaded by channel ${owner}, which is not in the supplied owned or linked channel lists. Catalog and channel lists may be incomplete.`;
    case 'owned_unwanted':
      return `"${video.title}" (${video.videoId}) is owned by the artist's channel ${owner} and was flagged for identity review. Upload control does not establish release ownership.`;
  }
}
