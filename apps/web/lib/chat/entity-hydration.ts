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
  return `- "${release.title}" — a ${noun} in THIS artist's own catalog${factSuffix}. Treat any reference to it as the user's own release, never another artist's work.`;
}

/**
 * Build the "Referenced entities" system-prompt block from tokens in the recent
 * user turns. Returns `undefined` when no entity tokens are present (so the
 * caller can omit the section entirely and keep the prompt stable).
 *
 * Resolution rules:
 *  - `@release` / `@track` whose id matches an owned release → hydrated as the
 *    artist's own asset with catalog facts.
 *  - `@artist` whose label matches the artist's own display name/username → the
 *    user themselves.
 *  - Anything else → described as "referenced by the user" with a neutral note
 *    so the model does not invent attribution.
 */
export function buildReferencedEntitiesBlock(
  input: HydrateReferencedEntitiesInput
): string | undefined {
  const mentions = input.userTexts.flatMap(text => extractEntities(text ?? ''));
  if (mentions.length === 0) return undefined;

  const releaseById = new Map(input.ownedReleases.map(r => [r.id, r]));
  const ownNames = new Set(
    [input.artist.displayName, input.artist.username]
      .map(name => name?.trim().toLowerCase())
      .filter((name): name is string => Boolean(name))
  );

  const seen = new Set<string>();
  const lines: string[] = [];

  for (const mention of mentions) {
    const dedupeKey = `${mention.kind}:${mention.id}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    if (mention.kind === 'release' || mention.kind === 'track') {
      const owned = releaseById.get(mention.id);
      if (owned) {
        lines.push(describeOwnedRelease(owned));
        continue;
      }
    }

    if (
      mention.kind === 'artist' &&
      ownNames.has(mention.label.trim().toLowerCase())
    ) {
      lines.push(
        `- "${mention.label}" — this is the user (the artist you are assisting), not a different artist.`
      );
      continue;
    }

    lines.push(
      `- "${mention.label}" (${mention.kind}) — referenced by the user. Do not assert who it belongs to unless it appears in this artist's own catalog above.`
    );
  }

  return `## Referenced Entities
The user's latest message references the following entities. Use these resolved facts; do not contradict them or re-attribute owned assets to another artist.
${lines.join('\n')}`;
}
