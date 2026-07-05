/**
 * Unit tests for server-side chat entity hydration (JOV-3537).
 *
 * Regression guard for the bug where `@kind:id[label]` tokens were passed to
 * the model as bare labels with no catalog resolution, causing the assistant
 * to treat the artist's own release as "another artist's work".
 */

import { describe, expect, it } from 'vitest';
import { buildReferencedEntitiesBlock } from '@/lib/chat/entity-hydration';
import { serializeEntity } from '@/lib/chat/tokens';
import type { ReleaseContext } from '@/lib/chat/types';

const ARTIST = { displayName: 'Luna Waves', username: 'lunawaves' } as const;

function ownedRelease(overrides?: Partial<ReleaseContext>): ReleaseContext {
  return {
    id: 'rel_revival_001',
    title: 'Revival',
    releaseType: 'single',
    releaseDate: '2025-08-22T00:00:00Z',
    artworkUrl: null,
    spotifyPopularity: 38,
    totalTracks: 1,
    canvasStatus: 'not_set',
    metadata: null,
    ...overrides,
  };
}

function tokenText(
  kind: 'release' | 'track' | 'artist' | 'event',
  id: string,
  label: string
): string {
  return `Tell me about ${serializeEntity({ kind, id, label })}`;
}

describe('buildReferencedEntitiesBlock', () => {
  it('returns undefined when there are no entity tokens', () => {
    expect(
      buildReferencedEntitiesBlock({
        userTexts: ['How is my latest single doing?'],
        ownedReleases: [ownedRelease()],
        artist: ARTIST,
      })
    ).toBeUndefined();
  });

  it('hydrates an owned @release token as the artist own catalog', () => {
    const block = buildReferencedEntitiesBlock({
      userTexts: [tokenText('release', 'rel_revival_001', 'Revival')],
      ownedReleases: [ownedRelease()],
      artist: ARTIST,
    });

    expect(block).toBeDefined();
    expect(block).toContain('Referenced Entities');
    expect(block).toContain('"Revival"');
    expect(block).toContain('single');
    expect(block?.toLowerCase()).toContain("this artist's own catalog");
    expect(block?.toLowerCase()).toContain('never another artist');
  });

  it('resolves @track tokens against the owned release catalog too', () => {
    const block = buildReferencedEntitiesBlock({
      userTexts: [tokenText('track', 'rel_revival_001', 'Revival')],
      ownedReleases: [ownedRelease()],
      artist: ARTIST,
    });

    expect(block?.toLowerCase()).toContain("this artist's own catalog");
  });

  it('does not claim ownership for a release id not in the catalog', () => {
    const block = buildReferencedEntitiesBlock({
      userTexts: [tokenText('release', 'rel_unknown_999', 'Someone Else Song')],
      ownedReleases: [ownedRelease()],
      artist: ARTIST,
    });

    expect(block).toBeDefined();
    expect(block).toContain('"Someone Else Song"');
    // Not described with the owned-release framing — only the neutral
    // "do not assert who it belongs to" guidance.
    expect(block?.toLowerCase()).not.toContain('treat any reference to it');
    expect(block?.toLowerCase()).toContain('do not assert who it belongs to');
  });

  it('recognises an @artist token that matches the user own identity', () => {
    const block = buildReferencedEntitiesBlock({
      userTexts: [tokenText('artist', 'art_self', 'Luna Waves')],
      ownedReleases: [ownedRelease()],
      artist: ARTIST,
    });

    expect(block?.toLowerCase()).toContain('this is the user');
  });

  it('de-duplicates repeated references to the same entity', () => {
    const text = `${tokenText('release', 'rel_revival_001', 'Revival')} and again ${serializeEntity(
      { kind: 'release', id: 'rel_revival_001', label: 'Revival' }
    )}`;
    const block = buildReferencedEntitiesBlock({
      userTexts: [text],
      ownedReleases: [ownedRelease()],
      artist: ARTIST,
    });

    const occurrences = block?.match(/"Revival"/g)?.length ?? 0;
    expect(occurrences).toBe(1);
  });
});
