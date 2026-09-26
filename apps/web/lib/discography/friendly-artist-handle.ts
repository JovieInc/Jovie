/**
 * Friendly-handle composer for ingested (unclaimed) artist profiles. JOV-6528
 *
 * Today `buildUnclaimedArtistHandle` publishes the artist's full registry
 * UUID, base36-encoded, as the public handle (`a_<25 chars>`). That token is
 * hard to recognize, type, share, and rank, and makes a legitimate profile
 * look generated. This module composes ranked, human-friendly candidates
 * deterministically from identity signals the ingestion pipeline already has:
 *
 *   1. canonical registry artist name
 *   2. verified provider (Spotify) display name
 *   3. strongest single token of the name (first token for multi-word names)
 *
 * Every candidate passes the canonical username contract
 * (`validateUsernameCore`: reserved words, format, content filter) before it
 * can be ranked. The deterministic opaque `a_*` handle stays as the
 * collision-safe fallback so ingest can never fail closed for lack of a
 * friendly candidate.
 *
 * JEV UPGRADE PATH: the Jev/typesafe-ai composer (not yet shipped in-repo)
 * will later REPLACE `composeFriendlyArtistHandleCandidates` with an
 * evidence-ranked, model-proposed candidate list carrying per-candidate
 * confidence + rejection reasons. The deterministic policy below —
 * normalization, reserved-word handling, collision resolution in-transaction,
 * persistence — is intentionally model-independent and stays authoritative.
 * Model output never establishes identity or ownership.
 */

import { validateUsernameCore } from '@/lib/validation/username-core';

import type { SpotifyArtistProfileData } from './collaborator-profile-plan';

/** Ranked, evidence-sourced handle candidate ready for collision resolution. */
export interface FriendlyArtistHandleCandidate {
  /** Deterministic rank: lower is better. */
  readonly rank: number;
  readonly handle: string;
  /** Which identity signal produced the candidate. */
  readonly source:
    | 'registry_artist_name'
    | 'provider_display_name'
    | 'primary_name_token'
    | 'enriched_identity';
}

/** Why a proposed candidate was rejected by the deterministic policy. */
export type FriendlyHandleRejectionReason =
  | 'empty_after_normalization'
  | 'fails_username_contract';

export interface RejectedFriendlyHandleCandidate {
  readonly handle: string;
  readonly source: FriendlyArtistHandleCandidate['source'];
  readonly reason: FriendlyHandleRejectionReason;
}

export interface ComposedFriendlyArtistHandles {
  readonly accepted: FriendlyArtistHandleCandidate[];
  readonly rejected: RejectedFriendlyHandleCandidate[];
}

/**
 * Normalize a display name into a legal public-handle character run.
 *
 * Applies latin ASCII transliteration for common accented forms, strips
 * punctuation, collapses separator runs to single hyphens, and lowercases.
 * Non-Latin scripts transliterate to empty here; the rejection record keeps
 * that observable instead of silently minting an opaque handle.
 */
export function normalizeArtistNameToHandleBase(name: string): string {
  const folded = name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  // Punctuation is removed. Spaces and slashes stay separators so
  // "N*i$ha O'Connor" becomes niha-oconnor, while "AC/DC" stays ac-dc.
  const stripped = folded.replaceAll(/[^a-z0-9\s/-]+/g, '');
  return stripped.replaceAll(/[\s/-]+/g, '-').replaceAll(/^-+|-+$/g, '');
}

/**
 * Compose ranked friendly-handle candidates for one ingested artist.
 *
 * Ordered by Tim's locked example: for "Fedde Le Grand" the full joined form
 * `feddelegrand` ranks above the primary token `fedde`. Candidate generation
 * is pure and deterministic — the same inputs always produce the same list.
 */
export function composeFriendlyArtistHandleCandidates(input: {
  readonly registryName: string | null | undefined;
  readonly providerArtist: SpotifyArtistProfileData | undefined;
  // Artist-controlled destinations from identity enrichment (JOV-6529):
  // official domains and verified social handles propose handle tokens;
  // the deterministic contract below still validates and ranks them.
  readonly identityLinks?: readonly {
    readonly platform: string;
    readonly url: string;
  }[];
}): ComposedFriendlyArtistHandles {
  const accepted: FriendlyArtistHandleCandidate[] = [];
  const rejected: RejectedFriendlyHandleCandidate[] = [];

  const signalSources: Array<{
    readonly source: FriendlyArtistHandleCandidate['source'];
    readonly name: string | null | undefined;
  }> = [
    { source: 'registry_artist_name', name: input.registryName },
    { source: 'provider_display_name', name: input.providerArtist?.name },
    // Enriched artist-controlled identity from exact provider/entity
    // matches (e.g. MusicBrainz url-rels on an ISRC-matched artist).
    ...enrichedIdentityNames(input.identityLinks).map(name => ({
      source: 'enriched_identity' as const,
      name,
    })),
  ];

  const seen = new Set<string>();

  for (const { source, name } of signalSources) {
    const base = normalizeArtistNameToHandleBase(name ?? '');
    if (!base) {
      if (name && name.trim()) {
        rejected.push({
          handle: name.trim().toLowerCase(),
          source,
          reason: 'empty_after_normalization',
        });
      }
      continue;
    }

    const forms: string[] = [];
    for (const form of [base.replaceAll('-', ''), base.split('-')[0] ?? '']) {
      if (!form || seen.has(form)) continue;
      seen.add(form);
      forms.push(form);
    }

    for (const form of forms) {
      // Enforce the canonical username contract (reserved words, format,
      // content filter) before a candidate can be ranked. Forms that fail
      // (e.g. a reserved word like "top") are recorded, not silently kept.
      if (!validateUsernameCore(form).isValid) {
        rejected.push({
          handle: form,
          source,
          reason: 'fails_username_contract',
        });
        continue;
      }
      accepted.push({ rank: 0, handle: form, source });
    }
  }

  // Canonical registry name outranks provider display name; within one
  // source, the more specific (longer) joined form outranks single tokens —
  // `feddelegrand` above `fedde` (Tim's locked example).
  const ranked = accepted
    .slice()
    .sort((a, b) => rankOf(a) - rankOf(b) || b.handle.length - a.handle.length);
  ranked.forEach((candidate, index) => {
    accepted[index] = { ...candidate, rank: index };
  });
  accepted.length = ranked.length;

  return { accepted, rejected };
}

const SOCIAL_HANDLE_PLATFORMS = new Set([
  'instagram',
  'twitter',
  'tiktok',
  'facebook',
  'youtube',
  'twitch',
  'soundcloud',
  'bandcamp',
]);

// Website links contribute the second-level domain label; social links the
// handle segment. Malformed inputs are ignored.
function enrichedIdentityNames(
  links:
    | readonly { readonly platform: string; readonly url: string }[]
    | undefined
): string[] {
  const names: string[] = [];
  for (const link of links ?? []) {
    try {
      const parsed = new URL(link.url);
      const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
      if (link.platform === 'website') {
        const label = host.split('.').slice(0, -1).join('.');
        if (label) names.push(label);
      } else if (SOCIAL_HANDLE_PLATFORMS.has(link.platform)) {
        const segment = parsed.pathname.split('/').filter(Boolean)[0];
        if (segment) names.push(segment.replace(/^@/, ''));
      }
    } catch {
      continue;
    }
  }
  return names;
}

function rankOf(candidate: FriendlyArtistHandleCandidate): number {
  // Enriched artist-controlled identity ranks last as a supplementary signal.
  switch (candidate.source) {
    case 'registry_artist_name':
      return 0;
    case 'provider_display_name':
      return 1;
    default:
      return 2;
  }
}
