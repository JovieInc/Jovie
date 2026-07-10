import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { EntityRef } from '@/lib/commands/entities';
import {
  formatLongDate,
  ownGraphArtistToEntityRef,
  rankRecentsFirst,
  shortMonthDay,
} from './entity-mappers';

function artist(id: string, label: string, isYou = false): EntityRef {
  return {
    kind: 'artist',
    id,
    label,
    // Mirror artistResultToEntityRef: claimed self reads "You", others "Spotify artist".
    meta: { kind: 'artist', subtitle: isYou ? 'You' : 'Spotify artist', isYou },
  };
}

function release(id: string, label: string): EntityRef {
  return {
    kind: 'release',
    id,
    label,
    meta: { kind: 'release', subtitle: 'Album · Mar 14' },
  };
}

describe('rankRecentsFirst', () => {
  it('puts matched recents ahead of source results', () => {
    const recents = [artist('a1', 'Recent One')];
    const source = [artist('a2', 'Source Two'), artist('a3', 'Source Three')];
    const result = rankRecentsFirst(recents, source, '', 8);
    expect(result.map(r => r.id)).toEqual(['a1', 'a2', 'a3']);
  });

  it('de-dupes by kind:id so a graph artist that is also a Spotify hit shows once', () => {
    const recents = [artist('dup', 'Calvin Harris')];
    const source = [artist('dup', 'Calvin Harris'), artist('other', 'Other')];
    const result = rankRecentsFirst(recents, source, '', 8);
    expect(result.map(r => r.id)).toEqual(['dup', 'other']);
    // The surviving entry is the graph-attributed recent.
    expect(result[0]?.meta?.subtitle).toBe('Recent');
  });

  it('graph-attributes recent artists but keeps "You" for the claimed self', () => {
    const result = rankRecentsFirst(
      [artist('me', 'My Artist', true), artist('a1', 'Friend')],
      [],
      '',
      8
    );
    expect(result.find(r => r.id === 'me')?.meta?.subtitle).toBe('You');
    expect(result.find(r => r.id === 'a1')?.meta?.subtitle).toBe('Recent');
  });

  it('keeps the informative subtitle on recent releases', () => {
    const result = rankRecentsFirst([release('r1', 'My Album')], [], '', 8);
    expect(result[0]?.meta?.subtitle).toBe('Album · Mar 14');
  });

  it('does not clobber recent event subtitles', () => {
    const event: EntityRef = {
      kind: 'event',
      id: 'e1',
      label: 'Tour Stop',
      meta: { kind: 'event', subtitle: 'Tour · Berlin' },
    };
    const result = rankRecentsFirst([event], [], '', 8);
    expect(result[0]?.meta?.subtitle).toBe('Tour · Berlin');
  });

  it('filters recents by query against label and subtitle', () => {
    const recents = [artist('a1', 'Calvin Harris'), artist('a2', 'Drake')];
    const result = rankRecentsFirst(recents, [], 'cal', 8);
    expect(result.map(r => r.id)).toEqual(['a1']);
  });

  it('respects the limit after merging', () => {
    const recents = [artist('a1', 'One'), artist('a2', 'Two')];
    const source = [artist('a3', 'Three'), artist('a4', 'Four')];
    const result = rankRecentsFirst(recents, source, '', 3);
    expect(result.map(r => r.id)).toEqual(['a1', 'a2', 'a3']);
  });

  it('returns only source when there are no recents (Spotify fallback)', () => {
    const source = [artist('a1', 'One')];
    expect(rankRecentsFirst([], source, 'whatever', 8)).toEqual(source);
  });

  it('seeds claimed-self ahead of Spotify on cold start (JOV-3717)', () => {
    const self = ownGraphArtistToEntityRef({
      id: 'me-spotify',
      name: 'Tim White',
      imageUrl: 'https://example.com/a.jpg',
      isClaimedSelf: true,
    });
    const collab = ownGraphArtistToEntityRef({
      id: 'collab-1',
      name: 'Feature Artist',
      isClaimedSelf: false,
    });
    const spotify = [artist('spotify-hit', 'Random Spotify')];
    const result = rankRecentsFirst([self, collab], spotify, '', 8);
    expect(result.map(r => r.id)).toEqual([
      'me-spotify',
      'collab-1',
      'spotify-hit',
    ]);
    expect(result[0]?.meta?.subtitle).toBe('You');
    // Narrow the EntityRefMeta discriminated union before reading isYou.
    expect(result[0]?.meta).toMatchObject({ kind: 'artist', isYou: true });
  });
});

describe('ownGraphArtistToEntityRef', () => {
  it('marks claimed self as You and collaborators as Catalog', () => {
    expect(
      ownGraphArtistToEntityRef({
        id: '1',
        name: 'Me',
        isClaimedSelf: true,
      }).meta
    ).toMatchObject({ subtitle: 'You', isYou: true });
    expect(
      ownGraphArtistToEntityRef({
        id: '2',
        name: 'Collab',
        isClaimedSelf: false,
      }).meta
    ).toMatchObject({ subtitle: 'Catalog', isYou: false });
  });
});

describe('shortMonthDay', () => {
  beforeAll(() => {
    vi.stubEnv('TZ', 'America/Los_Angeles');
  });

  afterAll(() => {
    vi.unstubAllEnvs();
  });

  it('formats a date-only ISO string correctly regardless of local TZ', () => {
    expect(shortMonthDay('2026-03-14')).toBe('Mar 14');
  });

  it('formats a datetime ISO string and preserves the UTC date', () => {
    expect(shortMonthDay('2026-03-14T20:00:00Z')).toBe('Mar 14');
  });

  it('returns undefined for empty input', () => {
    expect(shortMonthDay('')).toBeUndefined();
    expect(shortMonthDay(undefined)).toBeUndefined();
  });

  it('returns undefined for invalid date strings', () => {
    expect(shortMonthDay('not-a-date')).toBeUndefined();
  });
});

describe('formatLongDate', () => {
  beforeAll(() => {
    vi.stubEnv('TZ', 'America/Los_Angeles');
  });

  afterAll(() => {
    vi.unstubAllEnvs();
  });

  it('formats a date-only ISO string correctly regardless of local TZ', () => {
    expect(formatLongDate('2026-03-14')).toBe('Mar 14, 2026');
  });

  it('formats a datetime ISO string and preserves the UTC date', () => {
    expect(formatLongDate('2026-03-14T20:00:00Z')).toBe('Mar 14, 2026');
  });

  it('returns null for empty input', () => {
    expect(formatLongDate('')).toBeNull();
    expect(formatLongDate(undefined)).toBeNull();
  });

  it('returns null for invalid date strings', () => {
    expect(formatLongDate('not-a-date')).toBeNull();
  });
});
