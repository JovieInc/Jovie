/**
 * YouTube credited-collaborator claims (JOV-5362).
 *
 * Unmatched or low-confidence names fail closed to review. Verified claims
 * may reconcile onto canonical artists and release/recording credits.
 */

import {
  type CatalogSnapshot,
  resolveCatalogCollaborator,
} from '@/lib/catalog';
import type { CollaboratorMatchMethod } from '@/lib/catalog/types';
import type { YouTubeChannelVideo } from './types';

export const COLLABORATOR_AUTO_APPROVE_CONFIDENCE = 0.9;

export type YouTubeCollaboratorClaimStatus =
  | 'pending_review'
  | 'approved'
  | 'rejected';

export type YouTubeCollaboratorRole = 'featured_artist' | 'with' | 'other';

export interface YouTubeCollaboratorClaim {
  readonly creditedName: string;
  readonly role: YouTubeCollaboratorRole;
  readonly artistId: string | null;
  readonly confidence: number;
  readonly matchMethod: CollaboratorMatchMethod | 'unmatched';
  readonly status: YouTubeCollaboratorClaimStatus;
  readonly evidence: {
    readonly source: 'youtube_description' | 'youtube_title' | 'provider';
    readonly excerpt: string;
  };
}

export interface YouTubeCreditWrite {
  readonly artistId: string;
  readonly creditedName: string;
  readonly role: YouTubeCollaboratorRole;
  readonly recordingId: string | null;
  readonly releaseId: string | null;
  readonly confidence: number;
}

const CREDIT_PATTERN = /\b(?:feat\.?|ft\.?|featuring|with)\s+([^()\n]+)/gi;

function splitCreditedNames(raw: string): string[] {
  return raw
    .split(/\s*(?:,|&| x | X )\s*/g)
    .map(part => part.replace(/\s+/g, ' ').trim())
    .filter(part => part.length > 1 && part.toLowerCase() !== 'official');
}

export function extractCreditedNames(input: {
  readonly title?: string | null;
  readonly description?: string | null;
  readonly creditedNames?: readonly string[];
}): readonly {
  name: string;
  role: YouTubeCollaboratorRole;
  excerpt: string;
}[] {
  if (input.creditedNames && input.creditedNames.length > 0) {
    return input.creditedNames.map(name => ({
      name,
      role: 'other' as const,
      excerpt: name,
    }));
  }

  const found: {
    name: string;
    role: YouTubeCollaboratorRole;
    excerpt: string;
  }[] = [];
  const seen = new Set<string>();
  const haystacks: { text: string; sourceRole: YouTubeCollaboratorRole }[] = [
    { text: input.description ?? '', sourceRole: 'featured_artist' },
    { text: input.title ?? '', sourceRole: 'featured_artist' },
  ];

  for (const haystack of haystacks) {
    if (!haystack.text) continue;
    CREDIT_PATTERN.lastIndex = 0;
    let match = CREDIT_PATTERN.exec(haystack.text);
    while (match) {
      const excerpt = match[0];
      const role: YouTubeCollaboratorRole = /\bwith\b/i.test(match[0])
        ? 'with'
        : 'featured_artist';
      for (const name of splitCreditedNames(match[1] ?? '')) {
        const key = name.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        found.push({ name, role, excerpt });
      }
      match = CREDIT_PATTERN.exec(haystack.text);
    }
  }
  return found;
}

export function resolveYouTubeCollaboratorClaims(input: {
  readonly title?: string | null;
  readonly description?: string | null;
  readonly creditedNames?: readonly string[];
  readonly catalog: CatalogSnapshot;
}): YouTubeCollaboratorClaim[] {
  return extractCreditedNames(input).map(credit => {
    const resolved = resolveCatalogCollaborator(input.catalog, {
      text: credit.name,
    });
    const confidence = resolved?.confidence ?? 0;
    const verified =
      Boolean(resolved) && confidence >= COLLABORATOR_AUTO_APPROVE_CONFIDENCE;
    return {
      creditedName: credit.name,
      role: credit.role,
      artistId: verified ? (resolved?.collaborator.id ?? null) : null,
      confidence,
      matchMethod: resolved?.matchMethod ?? 'unmatched',
      status: verified ? 'approved' : 'pending_review',
      evidence: {
        source: input.creditedNames?.length
          ? 'provider'
          : input.description?.includes(credit.excerpt)
            ? 'youtube_description'
            : 'youtube_title',
        excerpt: credit.excerpt,
      },
    };
  });
}

/**
 * Only verified (approved + artist id + confidence) claims may write credits.
 * Low-confidence or unmatched claims return null and stay in review.
 */
export function reconcileVerifiedCollaboratorCredit(input: {
  readonly claim: YouTubeCollaboratorClaim;
  readonly recordingId: string | null;
  readonly releaseId: string | null;
}): YouTubeCreditWrite | null {
  const { claim } = input;
  if (
    claim.status !== 'approved' ||
    !claim.artistId ||
    claim.confidence < COLLABORATOR_AUTO_APPROVE_CONFIDENCE
  ) {
    return null;
  }
  return {
    artistId: claim.artistId,
    creditedName: claim.creditedName,
    role: claim.role,
    recordingId: input.recordingId,
    releaseId: input.releaseId,
    confidence: claim.confidence,
  };
}

export function planYouTubeImportArtifacts(input: {
  readonly existingVideoIds: ReadonlySet<string>;
  readonly imported: readonly {
    readonly videoPk: string;
    readonly video: YouTubeChannelVideo;
  }[];
  readonly catalog: CatalogSnapshot;
}) {
  return {
    sourceEvents: input.imported.map(row => ({
      videoPk: row.videoPk,
      providerVideoId: row.video.videoId,
      kind: input.existingVideoIds.has(row.video.videoId)
        ? ('refreshed' as const)
        : ('imported' as const),
      payload: {
        channelId: row.video.channelId,
        url: row.video.url,
        privacyStatus: row.video.privacyStatus,
        title: row.video.title,
      },
    })),
    collaboratorClaims: input.imported.flatMap(row =>
      resolveYouTubeCollaboratorClaims({
        title: row.video.title,
        description: row.video.description,
        creditedNames: row.video.creditedNames,
        catalog: input.catalog,
      }).map(claim => ({ videoPk: row.videoPk, claim }))
    ),
  };
}
