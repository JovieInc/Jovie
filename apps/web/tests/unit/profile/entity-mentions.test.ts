import { describe, expect, it } from 'vitest';
import {
  collectEntityMentions,
  type EntityMentionContext,
  linkEntityMentions,
  MAX_ENTITY_MENTIONS,
} from '@/lib/profile/entity-mentions';

const context: EntityMentionContext = {
  ownHandle: 'tim',
  releases: [
    { title: 'Take Me Over', slug: 'take-me-over' },
    { title: 'Gate', slug: 'gate' },
    { title: 'Sky', slug: 'sky' },
  ],
  artists: [
    { name: 'Cosmic Gate', handle: 'cosmicgate' },
    { name: 'The Disco Biscuits', handle: null },
    { name: 'Tim', handle: 'tim' },
  ],
};

describe('linkEntityMentions', () => {
  it('links a quoted release title, leaving the quotes as plain text', () => {
    const segments = linkEntityMentions(
      'Check out "Take Me Over" on streaming now.',
      context
    );

    expect(segments).toEqual([
      { type: 'text', text: 'Check out "' },
      {
        type: 'release',
        text: 'Take Me Over',
        href: '/tim/take-me-over',
      },
      { type: 'text', text: '" on streaming now.' },
    ]);
  });

  it('prefers the longest overlapping name', () => {
    const segments = linkEntityMentions(
      'Toured with Cosmic Gate last summer.',
      context
    );

    expect(segments).toEqual([
      { type: 'text', text: 'Toured with ' },
      { type: 'artist', text: 'Cosmic Gate', href: '/cosmicgate' },
      { type: 'text', text: ' last summer.' },
    ]);
  });

  it('matches case-insensitively but preserves the original casing in the segment', () => {
    const segments = linkEntityMentions(
      'take me over was the first single.',
      context
    );

    expect(segments).toEqual([
      { type: 'release', text: 'take me over', href: '/tim/take-me-over' },
      { type: 'text', text: ' was the first single.' },
    ]);
  });

  it('keeps artists without a Jovie profile as plain text', () => {
    const segments = linkEntityMentions(
      'Shared bills with The Disco Biscuits.',
      context
    );

    expect(segments).toEqual([
      { type: 'text', text: 'Shared bills with The Disco Biscuits.' },
    ]);
  });

  it('does not match inside longer words (word boundaries)', () => {
    const segments = linkEntityMentions(
      'The Skyline venue was packed.',
      context
    );

    expect(segments).toEqual([
      { type: 'text', text: 'The Skyline venue was packed.' },
    ]);
  });

  it('links a standalone short title at a word boundary', () => {
    const segments = linkEntityMentions('Sky is the opener.', context);

    expect(segments).toEqual([
      { type: 'release', text: 'Sky', href: '/tim/sky' },
      { type: 'text', text: ' is the opener.' },
    ]);
  });

  it('keeps the profile owner name as plain text (self-mention)', () => {
    // Self-mentions must not link back to the profile the bio lives on —
    // or to a duplicate profile row carrying the same handle.
    const segments = linkEntityMentions(
      'Tim started producing in 2012.',
      context
    );

    expect(segments).toEqual([
      { type: 'text', text: 'Tim started producing in 2012.' },
    ]);
  });

  it('keeps ambiguous owner names out of prose links and JSON-LD mentions', () => {
    const duplicateContext: EntityMentionContext = {
      ...context,
      ownName: ' Tim White ',
      artists: [
        { name: 'Tim White', handle: 'tmoc9mm7xfvx02c' },
        { name: 'Cosmic Gate', handle: 'cosmicgate' },
      ],
    };
    const text = 'TIM WHITE worked with Cosmic Gate on Take Me Over.';
    expect(linkEntityMentions(text, duplicateContext)).toEqual([
      { type: 'text', text: 'TIM WHITE worked with ' },
      { type: 'artist', text: 'Cosmic Gate', href: '/cosmicgate' },
      { type: 'text', text: ' on ' },
      { type: 'release', text: 'Take Me Over', href: '/tim/take-me-over' },
      { type: 'text', text: '.' },
    ]);
    expect(collectEntityMentions(duplicateContext)).not.toContainEqual(
      expect.objectContaining({ kind: 'artist', name: 'Tim White' })
    );
  });

  it('treats canonical handles case-insensitively and preserves same-name releases', () => {
    const ownContext: EntityMentionContext = {
      ownHandle: 'Tim',
      ownName: 'Tim White',
      releases: [{ title: 'Tim White', slug: 'self-titled' }],
      artists: [{ name: 'Tim', handle: 'TIM' }],
    };
    expect(collectEntityMentions(ownContext)).toEqual([
      { kind: 'release', name: 'Tim White', href: '/Tim/self-titled' },
    ]);
  });

  it('links multiple entities in one paragraph', () => {
    const segments = linkEntityMentions(
      'After Take Me Over, Cosmic Gate remixed it.',
      context
    );

    expect(segments).toEqual([
      { type: 'text', text: 'After ' },
      { type: 'release', text: 'Take Me Over', href: '/tim/take-me-over' },
      { type: 'text', text: ', ' },
      { type: 'artist', text: 'Cosmic Gate', href: '/cosmicgate' },
      { type: 'text', text: ' remixed it.' },
    ]);
  });

  it('returns a single text segment when there is nothing to link', () => {
    expect(linkEntityMentions('Hello world.', { ownHandle: 'tim' })).toEqual([
      { type: 'text', text: 'Hello world.' },
    ]);
    expect(linkEntityMentions('', context)).toEqual([]);
  });

  it('prefers the release when a release and artist share the same name', () => {
    const segments = linkEntityMentions('Gate changed everything.', {
      ownHandle: 'tim',
      releases: [{ title: 'Gate', slug: 'gate' }],
      artists: [{ name: 'Gate', handle: 'gate' }],
    });

    expect(segments).toEqual([
      { type: 'release', text: 'Gate', href: '/tim/gate' },
      { type: 'text', text: ' changed everything.' },
    ]);
  });

  it('ignores releases without a slug and single-character phrases', () => {
    const segments = linkEntityMentions('X marks Gate.', {
      ownHandle: 'tim',
      releases: [{ title: 'Gate' }],
      artists: [{ name: 'X', handle: 'x' }],
    });

    expect(segments).toEqual([{ type: 'text', text: 'X marks Gate.' }]);
  });
});

describe('collectEntityMentions', () => {
  it('collects deduped linkable entities with hrefs', () => {
    const mentions = collectEntityMentions(context);

    expect(mentions).toContainEqual({
      kind: 'release',
      name: 'Take Me Over',
      href: '/tim/take-me-over',
    });
    expect(mentions).toContainEqual({
      kind: 'artist',
      name: 'Cosmic Gate',
      href: '/cosmicgate',
    });
    // No Jovie profile → not collected.
    expect(
      mentions.some(mention => mention.name === 'The Disco Biscuits')
    ).toBe(false);
    // Own handle → self-mention, never collected.
    expect(
      mentions.some(
        mention => mention.kind === 'artist' && mention.href === '/tim'
      )
    ).toBe(false);
  });

  it('caps the number of mentions', () => {
    const manyReleases = Array.from(
      { length: MAX_ENTITY_MENTIONS + 10 },
      (_, i) => ({
        title: `Release Number ${i}`,
        slug: `release-number-${i}`,
      })
    );

    const mentions = collectEntityMentions({
      ownHandle: 'tim',
      releases: manyReleases,
    });

    expect(mentions).toHaveLength(MAX_ENTITY_MENTIONS);
  });
});
