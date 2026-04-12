import { describe, expect, it } from 'vitest';
import { parseSmartLinkSlug } from '@/lib/utils/smart-link';

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
