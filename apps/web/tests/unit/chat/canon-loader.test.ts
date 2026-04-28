/**
 * Canon loader / frontmatter validation tests.
 *
 * The canon loader throws at module load on invalid frontmatter so bad
 * docs fail loudly during deploy rather than silently degrading retrieval.
 * These tests exercise that contract directly via the parser export.
 */

import { describe, expect, it } from 'vitest';

import { __INTERNAL_FOR_TESTS__ } from '@/lib/chat/knowledge/canon-loader';

const { parseFrontmatter } = __INTERNAL_FOR_TESTS__;

describe('canon-loader frontmatter parser', () => {
  it('parses a well-formed canon doc', () => {
    const raw = [
      '---',
      'title: "Spotify Editorial Pitch Timing"',
      'claim: "Pitch Spotify editorial 4-6 weeks before release."',
      'tags: [playlists, editorial, spotify, pitching]',
      '---',
      '',
      '# Body content',
      'starts here.',
      '',
    ].join('\n');

    const { meta, body } = parseFrontmatter(raw, 'playlist.md');
    expect(meta.title).toBe('Spotify Editorial Pitch Timing');
    expect(meta.tags).toEqual([
      'playlists',
      'editorial',
      'spotify',
      'pitching',
    ]);
    expect(body.startsWith('# Body content')).toBe(true);
  });

  it('throws when frontmatter delimiter is missing', () => {
    const raw = '# No frontmatter here\n\nBody body body.';
    expect(() => parseFrontmatter(raw, 'broken.md')).toThrowError(
      /missing frontmatter/
    );
  });

  it('throws when required field `title` is absent', () => {
    const raw = [
      '---',
      'claim: "fine claim"',
      'tags: [playlists]',
      '---',
      '',
      'body',
    ].join('\n');
    expect(() => parseFrontmatter(raw, 'no-title.md')).toThrowError(
      /invalid frontmatter/i
    );
  });

  it('throws when a tag is outside the closed vocabulary', () => {
    const raw = [
      '---',
      'title: "OK"',
      'claim: "OK claim that is long enough"',
      'tags: [playlists, NOT_A_REAL_TAG]',
      '---',
      '',
      'body',
    ].join('\n');
    expect(() => parseFrontmatter(raw, 'bad-tag.md')).toThrowError(
      /invalid frontmatter/i
    );
  });

  it('throws when frontmatter is unclosed', () => {
    const raw = [
      '---',
      'title: "OK"',
      'claim: "OK claim that is long enough"',
      'tags: [playlists]',
      '',
      'no closing delimiter',
    ].join('\n');
    expect(() => parseFrontmatter(raw, 'unclosed.md')).toThrowError(
      /unclosed frontmatter/i
    );
  });

  it('accepts an optional source_url', () => {
    const raw = [
      '---',
      'title: "With Source"',
      'claim: "A claim that is long enough to clear the min length."',
      'tags: [release]',
      'source_url: "https://example.com/article"',
      '---',
      '',
      'body',
    ].join('\n');
    const { meta } = parseFrontmatter(raw, 'with-source.md');
    expect(meta.source_url).toBe('https://example.com/article');
  });
});
