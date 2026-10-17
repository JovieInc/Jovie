/**
 * Server-side entity hydration for chat turns (JOV-3537).
 *
 * Entity mentions ride the wire as opaque `@kind:id[label]` tokens
 * (see `tokens.ts`). Without server-side resolution the model only ever sees
 * the bare `[label]` and routinely mis-attributes the artist's own release to
 * "another artist". This module parses those tokens from the recent user turns
 * and resolves each id against the data already loaded for the turn — the
 * artist's own catalog (`releases`, the same `discogReleases` rows that feed the
 * right-rail `ChatReleaseEntityPanel` via `loadReleaseEntity`) and the artist's
 * own identity — then renders a compact "Referenced entities" block for the
 * system prompt so the model treats owned assets as owned.
 *
 * Pure functions — no React, no fetching. Resolution reuses the catalog the
 * route already fetched (`fetchReleasesForChat`), so there is no extra DB call
 * and owned-catalog matches are inherently preferred.
 */

import { extractEntities } from '@/lib/chat/tokens';
import type { ReleaseContext } from '@/lib/chat/types';

/** Minimal artist identity needed to recognise self-references. */
export interface HydrationArtistIdentity {
  readonly displayName: string;
  readonly username: string;
  readonly spotifyUrl?: string | null;
}

export interface HydrateReferencedEntitiesInput {
  /**
   * Recent user message texts (most-recent first is fine — order is preserved
   * for de-duplication but does not affect output). Each is the raw wire string
   * that may carry `@kind:id[label]` tokens.
   */
  readonly userTexts: readonly string[];
  /** The artist's own catalog already loaded for this turn. */
  readonly ownedReleases: readonly ReleaseContext[];
  /** The artist's own identity, used to recognise `@artist` self-references. */
  readonly artist: HydrationArtistIdentity;
}

const RELEASE_TYPE_NOUN: Record<string, string> = {
  single: 'single',
  album: 'album',
  ep: 'EP',
  compilation: 'compilation',
  mixtape: 'mixtape',
  music_video: 'music video',
};

function releaseTypeNoun(releaseType: string): string {
  return RELEASE_TYPE_NOUN[releaseType] ?? releaseType.replaceAll('_', ' ');
}

function formatReleaseDate(value: string | null): string | null {
  if (!value) return null;
  return value.slice(0, 10);
}

function describeOwnedRelease(release: ReleaseContext): string {
  const noun = releaseTypeNoun(release.releaseType);
  const date = formatReleaseDate(release.releaseDate);
  const facts: string[] = [];
  if (date) facts.push(`released ${date}`);
  if (release.totalTracks > 0) {
    const trackLabel = release.totalTracks === 1 ? 'track' : 'tracks';
    facts.push(`${release.totalTracks} ${trackLabel}`);
  }
  const factSuffix = facts.length > 0 ? ` (${facts.join(', ')})` : '';
  return `- release:${release.id} "${release.title}" — a ${noun} in THIS artist's own catalog${factSuffix}. Treat any reference to it as the user's own release, never another artist's work.`;
}

/**
 * Build the "Referenced entities" system-prompt block from tokens in the recent
 * user turns. Returns `undefined` when no entity tokens are present (so the
 * caller can omit the section entirely and keep the prompt stable).
 *
 * Resolution rules:
 *  - `@release` whose id matches an owned release → hydrated as the
 *    artist's own asset with catalog facts.
 *  - `@artist` whose id matches the linked Spotify artist → the
 *    user themselves.
 *  - Anything else → unavailable/unsupported, without trusting the stored
 *    label as identity, ownership, or an action target.
 */
export function buildReferencedEntitiesBlock(
  input: HydrateReferencedEntitiesInput
): string | undefined {
  const mentions = input.userTexts.flatMap(text => extractEntities(text ?? ''));
  if (mentions.length === 0) return undefined;

  const releaseById = new Map(input.ownedReleases.map(r => [r.id, r]));
  let ownArtistId: string | undefined;
  try {
    const url = new URL(input.artist.spotifyUrl ?? '');
    if (url.protocol === 'https:' && url.hostname === 'open.spotify.com') {
      ownArtistId = /^\/artist\/([^/]+)\/?$/.exec(url.pathname)?.[1];
    }
  } catch {
    // Missing provider identity is not evidence that a matching name is self.
  }

  const seen = new Set<string>();
  const lines: string[] = [];

  for (const mention of mentions) {
    const dedupeKey = `${mention.kind}:${mention.id}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    if (mention.kind === 'release') {
      const owned = releaseById.get(mention.id);
      if (owned) {
        lines.push(describeOwnedRelease(owned));
        continue;
      }
    }

    if (
      mention.kind === 'artist' &&
      ownArtistId !== undefined &&
      mention.id === ownArtistId
    ) {
      lines.push(
        `- "${input.artist.displayName}" (artist:${mention.id}) — this is the user (the artist you are assisting), not a different artist.`
      );
      continue;
    }

    lines.push(
      `- ${mention.kind}:${mention.id} — unavailable or unsupported in the current authorized read model. The token label is not verified. Do not infer identity, ownership, or an action target from it; request a supported reference.`
    );
  }

  return `## Referenced Entities
The user's latest message references the following entities. Use these resolved facts; do not contradict them or re-attribute owned assets to another artist.
${lines.join('\n')}`;
}
