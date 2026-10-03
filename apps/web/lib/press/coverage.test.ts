import { describe, expect, it } from 'vitest';
import {
  creatorMentionCandidates,
  hasVerifiedCreatorMention,
  isSelfPublishedDomain,
  normalizeMentionText,
  PRESS_COVERAGE_EXCERPT_MAX_LENGTH,
  publisherDomainFromUrl,
} from './coverage';

describe('normalizeMentionText', () => {
  it('lowercases and collapses punctuation to word separators', () => {
    expect(normalizeMentionText('Tim White, Jr.!')).toBe('tim white jr');
    expect(normalizeMentionText('  JOVIE  ')).toBe('jovie');
  });
});

describe('creatorMentionCandidates', () => {
  it('includes display name and handle variants', () => {
    const candidates = creatorMentionCandidates({
      displayName: 'Tim White',
      usernameNormalized: 'timwhitemusic',
    });
    expect(candidates).toContain('tim white');
    expect(candidates).toContain('timwhitemusic');
    expect(candidates).toHaveLength(2);
  });

  it('dedupes a handle that normalizes to the display name', () => {
    const candidates = creatorMentionCandidates({
      displayName: 'Tim White',
      usernameNormalized: 'tim-white',
    });
    expect(candidates).toEqual(['tim white']);
  });

  it('drops candidates shorter than the minimum length', () => {
    const candidates = creatorMentionCandidates({
      displayName: 'Al',
      usernameNormalized: 'a',
    });
    expect(candidates).toHaveLength(0);
  });
});

describe('hasVerifiedCreatorMention', () => {
  const candidates = ['tim white'];

  it('matches a mention in the headline or body', () => {
    expect(
      hasVerifiedCreatorMention(
        { headline: 'Tim White launches Jovie', body: null },
        candidates
      )
    ).toBe(true);
    expect(
      hasVerifiedCreatorMention(
        { headline: 'New app', body: 'Founded by Tim White in 2026.' },
        candidates
      )
    ).toBe(true);
  });

  it('rejects similarly named people and substrings', () => {
    expect(
      hasVerifiedCreatorMention(
        { headline: 'Timothy Whitfield speaks', body: null },
        candidates
      )
    ).toBe(false);
    expect(
      hasVerifiedCreatorMention(
        { headline: 'A time whiteboard review', body: null },
        candidates
      )
    ).toBe(false);
    expect(
      hasVerifiedCreatorMention({ headline: null, body: null }, candidates)
    ).toBe(false);
  });
});

describe('publisherDomainFromUrl', () => {
  it('strips www and lowercases', () => {
    expect(
      publisherDomainFromUrl('https://www.RollingStone.com/music/news/x')
    ).toBe('rollingstone.com');
  });

  it('returns null for invalid URLs', () => {
    expect(publisherDomainFromUrl('not-a-url')).toBeNull();
  });
});

describe('isSelfPublishedDomain', () => {
  it('rejects Jovie-owned domains', () => {
    expect(isSelfPublishedDomain('jov.ie')).toBe(true);
    expect(isSelfPublishedDomain('artist.jov.ie')).toBe(true);
    expect(isSelfPublishedDomain('www.jovie.com'.replace('www.', ''))).toBe(
      true
    );
  });

  it('allows genuine third-party publishers', () => {
    expect(isSelfPublishedDomain('rollingstone.com')).toBe(false);
    expect(isSelfPublishedDomain('blog.rollingstone.com')).toBe(false);
  });
});

describe('excerpt bound', () => {
  it('caps stored excerpts well below the inspection body window', () => {
    expect(PRESS_COVERAGE_EXCERPT_MAX_LENGTH).toBeLessThanOrEqual(280);
  });
});
