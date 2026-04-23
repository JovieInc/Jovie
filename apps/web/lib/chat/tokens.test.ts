import { describe, expect, it } from 'vitest';
import {
  extractEntities,
  extractSkill,
  parseTokens,
  serializeEntity,
  serializeSkill,
  serializeTokens,
} from './tokens';

describe('tokens: serialize', () => {
  it('serializes an entity mention', () => {
    expect(
      serializeEntity({ kind: 'release', id: 'rel_1', label: 'Midnight Drive' })
    ).toBe('@release:rel_1[Midnight Drive]');
  });

  it('escapes ] in entity labels', () => {
    expect(
      serializeEntity({ kind: 'release', id: 'rel_1', label: 'Title [live]' })
    ).toBe('@release:rel_1[Title [live\\]]');
  });

  it('serializes a skill invocation', () => {
    expect(serializeSkill('generateAlbumArt')).toBe('/skill:generateAlbumArt');
  });
});

describe('tokens: parse', () => {
  it('returns empty array for empty input', () => {
    expect(parseTokens('')).toEqual([]);
  });

  it('parses plain text', () => {
    expect(parseTokens('hello world')).toEqual([
      { type: 'text', value: 'hello world' },
    ]);
  });

  it('parses a single entity', () => {
    expect(parseTokens('@release:rel_1[Midnight Drive]')).toEqual([
      { type: 'entity', kind: 'release', id: 'rel_1', label: 'Midnight Drive' },
    ]);
  });

  it('parses a single skill', () => {
    expect(parseTokens('/skill:generateAlbumArt')).toEqual([
      { type: 'skill', id: 'generateAlbumArt' },
    ]);
  });

  it('parses mixed text, skill, and entity in order', () => {
    const input =
      'hey /skill:generateAlbumArt for @release:rel_1[Midnight Drive] please';
    expect(parseTokens(input)).toEqual([
      { type: 'text', value: 'hey ' },
      { type: 'skill', id: 'generateAlbumArt' },
      { type: 'text', value: ' for ' },
      { type: 'entity', kind: 'release', id: 'rel_1', label: 'Midnight Drive' },
      { type: 'text', value: ' please' },
    ]);
  });

  it('unescapes ] in entity labels', () => {
    expect(parseTokens('@release:rel_1[Title [live\\]]')).toEqual([
      { type: 'entity', kind: 'release', id: 'rel_1', label: 'Title [live]' },
    ]);
  });

  it('ignores unknown entity kinds', () => {
    expect(parseTokens('@unknown:x[Y]')).toEqual([
      { type: 'text', value: '@unknown:x[Y]' },
    ]);
  });

  it('handles adjacent tokens without intervening text', () => {
    expect(parseTokens('/skill:generateAlbumArt@release:rel_1[Drive]')).toEqual(
      [
        { type: 'skill', id: 'generateAlbumArt' },
        { type: 'entity', kind: 'release', id: 'rel_1', label: 'Drive' },
      ]
    );
  });
});

describe('tokens: roundtrip', () => {
  it('roundtrips a mixed message', () => {
    const original =
      'make /skill:generateAlbumArt for @release:rel_1[Midnight Drive] now';
    expect(serializeTokens(parseTokens(original))).toBe(original);
  });

  it('roundtrips labels containing brackets', () => {
    const original = '@release:rel_1[Title [live\\]] vibes';
    expect(serializeTokens(parseTokens(original))).toBe(original);
  });

  it('roundtrips labels containing literal backslashes', () => {
    const tokens = [
      {
        type: 'entity' as const,
        kind: 'release' as const,
        id: 'rel_1',
        label: 'path\\to\\thing',
      },
    ];
    const wire = serializeTokens(tokens);
    expect(parseTokens(wire)).toEqual(tokens);
  });

  it('roundtrips labels containing backslash followed by bracket', () => {
    const tokens = [
      {
        type: 'entity' as const,
        kind: 'release' as const,
        id: 'rel_1',
        label: 'raw\\]edge',
      },
    ];
    const wire = serializeTokens(tokens);
    expect(parseTokens(wire)).toEqual(tokens);
  });

  it('roundtrips multiple entities of different kinds', () => {
    const original =
      '@release:rel_1[A] and @artist:art_2[B] and @track:trk_3[C]';
    expect(serializeTokens(parseTokens(original))).toBe(original);
  });
});

describe('tokens: extractors', () => {
  it('extracts all entities in order', () => {
    const input = '@release:rel_1[A] and @artist:art_2[B]';
    expect(extractEntities(input)).toEqual([
      { type: 'entity', kind: 'release', id: 'rel_1', label: 'A' },
      { type: 'entity', kind: 'artist', id: 'art_2', label: 'B' },
    ]);
  });

  it('extracts first skill', () => {
    expect(
      extractSkill('hey /skill:generateAlbumArt and /skill:submitFeedback')
    ).toEqual({ type: 'skill', id: 'generateAlbumArt' });
  });

  it('returns null when no skill present', () => {
    expect(extractSkill('just text')).toBeNull();
  });
});
