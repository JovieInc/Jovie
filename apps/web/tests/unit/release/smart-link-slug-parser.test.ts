import { describe, expect, it } from 'vitest';

/**
 * @smoke
 *
 * Tests for the slug parsing algorithm used by the smart link page
 * at /r/[slug]. The actual function is private inside the page component,
 * so we replicate the algorithm here to verify its behavior.
 */

function parseSmartLinkSlug(
  slug: string
): { releaseSlug: string; profileId: string } | null {
  const separator = '--';
  const lastSeparatorIndex = slug.lastIndexOf(separator);
  if (lastSeparatorIndex === -1) return null;
  const releaseSlug = slug.slice(0, lastSeparatorIndex);
  const profileId = slug.slice(lastSeparatorIndex + separator.length);
  if (!releaseSlug || !profileId) return null;
  return { releaseSlug, profileId };
}

describe('@smoke parseSmartLinkSlug', () => {
  it('parses a simple slug into releaseSlug and profileId', () => {
    const result = parseSmartLinkSlug('my-release--profile123');
    expect(result).toEqual({
      releaseSlug: 'my-release',
      profileId: 'profile123',
    });
  });

  it('returns null when there is no -- separator', () => {
    expect(parseSmartLinkSlug('no-separator')).toBe(null);
  });

  it('uses the last occurrence of -- when multiple separators exist', () => {
    const result = parseSmartLinkSlug(
      'release--with--multiple--separators--id'
    );
    expect(result).toEqual({
      releaseSlug: 'release--with--multiple--separators',
      profileId: 'id',
    });
  });

  it('returns null when releaseSlug is empty', () => {
    expect(parseSmartLinkSlug('--empty-release')).toBe(null);
  });

  it('returns null when profileId is empty', () => {
    expect(parseSmartLinkSlug('empty-profile--')).toBe(null);
  });

  it('returns null when both parts are empty', () => {
    expect(parseSmartLinkSlug('--')).toBe(null);
  });
});
