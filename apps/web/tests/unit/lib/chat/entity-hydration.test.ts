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

const ARTIST = {
  displayName: 'Luna Waves',
  username: 'lunawaves',
  spotifyUrl: 'https://open.spotify.com/artist/art_self',
} as const;

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

  it('does not resolve a track id as a release even when ids collide', () => {
    const block = buildReferencedEntitiesBlock({
      userTexts: [tokenText('track', 'rel_revival_001', 'Revival')],
      ownedReleases: [ownedRelease()],
      artist: ARTIST,
    });

    expect(block).toContain('unavailable or unsupported');
    expect(block).not.toContain('own catalog');
  });

  it('does not claim ownership for a release id not in the catalog', () => {
    const block = buildReferencedEntitiesBlock({
      userTexts: [tokenText('release', 'rel_unknown_999', 'Someone Else Song')],
      ownedReleases: [ownedRelease()],
      artist: ARTIST,
    });

    expect(block).toBeDefined();
    expect(block).not.toContain('Someone Else Song');
    // Not described with the owned-release framing — only the neutral
    // "do not assert who it belongs to" guidance.
    expect(block?.toLowerCase()).not.toContain('treat any reference to it');
    expect(block).toContain('Do not infer identity');
  });

  it('recognises an @artist token that matches the user own identity', () => {
    const block = buildReferencedEntitiesBlock({
      userTexts: [tokenText('artist', 'art_self', 'Luna Waves')],
      ownedReleases: [ownedRelease()],
      artist: ARTIST,
    });

    expect(block?.toLowerCase()).toContain('this is the user');
  });

  it('never treats a matching title or artist label as identity', () => {
    const block = buildReferencedEntitiesBlock({
      userTexts: ['@artist:someone_else[Luna Waves] @release:gone[Revival]'],
      ownedReleases: [ownedRelease()],
      artist: ARTIST,
    });
    expect(block).not.toContain('this is the user');
    expect(block).not.toContain('own catalog');
    expect(block).not.toContain('Luna Waves');
    expect(block).not.toContain('Revival');
  });

  it('uses the current title and exact id after a rename', () => {
    const block = buildReferencedEntitiesBlock({
      userTexts: ['@release:rel_revival_001[Private former title]'],
      ownedReleases: [ownedRelease({ title: 'Current title' })],
      artist: ARTIST,
    });
    expect(block).toContain('release:rel_revival_001 "Current title"');
    expect(block).not.toContain('Private former title');
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

describe('@profile references (chats started from a profile)', () => {
  const profileChip = serializeEntity({
    kind: 'profile',
    id: 'profile-own',
    label: 'Luna Waves',
  });

  it('resolves the signed-in creator profile and briefs a specific opener', () => {
    const block = buildReferencedEntitiesBlock({
      userTexts: [profileChip],
      ownedReleases: [],
      artist: ARTIST,
      ownProfileId: 'profile-own',
    });
    expect(block).toContain(
      `- profile:profile-own "Luna Waves" (@lunawaves) — the user's own Jovie profile.`
    );
    expect(block).toContain('Do not reply with a generic menu');
    expect(block).toContain('one or two real numbers');
    expect(block).toContain('never repeat their ids');
  });

  it('briefs only from the latest turn, not an earlier chip', () => {
    const block = buildReferencedEntitiesBlock({
      userTexts: ['What should I post this week?', profileChip],
      ownedReleases: [],
      artist: ARTIST,
      ownProfileId: 'profile-own',
    });
    expect(block).not.toContain('Do not reply with a generic menu');
  });

  it('briefs only the opening turn, matching where next moves show', () => {
    const block = buildReferencedEntitiesBlock({
      userTexts: [profileChip, 'What should I post this week?'],
      ownedReleases: [],
      artist: ARTIST,
      ownProfileId: 'profile-own',
    });
    expect(block).toContain("the user's own Jovie profile");
    expect(block).not.toContain('Do not reply with a generic menu');
  });

  it('skips the opener brief once the person asks something', () => {
    const asked = `${profileChip} How do I grow my audience?`;
    const block = buildReferencedEntitiesBlock({
      userTexts: [asked],
      ownedReleases: [],
      artist: ARTIST,
      ownProfileId: 'profile-own',
    });
    expect(block).toContain("the user's own Jovie profile");
    expect(block).not.toContain('Do not reply with a generic menu');
  });

  it('never trusts a profile id that is not the signed-in creator', () => {
    const other = serializeEntity({
      kind: 'profile',
      id: 'profile-other',
      label: 'Someone Else',
    });
    for (const ownProfileId of ['profile-own', null, undefined]) {
      const block = buildReferencedEntitiesBlock({
        userTexts: [other],
        ownedReleases: [],
        artist: ARTIST,
        ownProfileId,
      });
      expect(block).toContain('profile:profile-other — unavailable');
      expect(block).not.toContain('Someone Else');
      expect(block).not.toContain('Do not reply with a generic menu');
    }
  });
});
