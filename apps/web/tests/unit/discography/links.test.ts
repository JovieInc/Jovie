import { describe, expect, it } from 'vitest';
import { generateBaseSlug } from '@/lib/discography/slug';
import {
  buildIsrcLookupPath,
  buildReleaseSlug,
  buildSmartLinkPath,
  buildSmartLinkUrl,
  parseLegacySmartLinkSlug,
} from '@/lib/discography/utils';

describe('discography smart link helpers', () => {
  describe('new short URL format', () => {
    it('builds smart link path with handle and slug', () => {
      const path = buildSmartLinkPath('tim', 'midnight-dreams');
      expect(path).toBe('/tim/midnight-dreams');
    });

    it('builds smart link URL with handle and slug', () => {
      const url = buildSmartLinkUrl('https://jov.ie', 'tim', 'midnight-dreams');
      expect(url).toBe('https://jov.ie/tim/midnight-dreams');
    });

    it('normalizes base URLs by removing trailing slash', () => {
      const url = buildSmartLinkUrl(
        'https://jov.ie/',
        'tim',
        'midnight-dreams'
      );
      expect(url).toBe('https://jov.ie/tim/midnight-dreams');
    });

    it('appends DSP provider query param when specified', () => {
      const path = buildSmartLinkPath('tim', 'midnight-dreams', 'spotify');
      expect(path).toBe('/tim/midnight-dreams?dsp=spotify');

      const url = buildSmartLinkUrl(
        'https://jov.ie',
        'tim',
        'midnight-dreams',
        'soundcloud'
      );
      expect(url).toBe('https://jov.ie/tim/midnight-dreams?dsp=soundcloud');
    });
  });

  describe('ISRC lookup', () => {
    it('builds ISRC lookup path', () => {
      const path = buildIsrcLookupPath('USRC17607839');
      expect(path).toBe('/r/isrc/USRC17607839');
    });

    it('normalizes ISRC by removing dashes and uppercasing', () => {
      const path = buildIsrcLookupPath('us-rc1-76-07839');
      expect(path).toBe('/r/isrc/USRC17607839');
    });
  });

  describe('legacy format (deprecated)', () => {
    it('builds legacy slug with profileId--releaseId format', () => {
      const slug = buildReleaseSlug('profile-123', 'release-abc');
      expect(slug).toBe('release-abc--profile-123');
    });

    it('parses legacy smart link slug', () => {
      const parsed = parseLegacySmartLinkSlug('release-abc--profile-123');
      expect(parsed).toEqual({
        releaseSlug: 'release-abc',
        profileId: 'profile-123',
      });
    });

    it('returns null for invalid legacy slug format', () => {
      expect(parseLegacySmartLinkSlug('no-separator-here')).toBeNull();
      expect(parseLegacySmartLinkSlug('--just-profile')).toBeNull();
      expect(parseLegacySmartLinkSlug('just-release--')).toBeNull();
    });
  });
});

describe('slug generation', () => {
  it('generates URL-safe slugs from titles', () => {
    expect(generateBaseSlug('Blinding Lights')).toBe('blinding-lights');
    expect(generateBaseSlug('Save Your Tears')).toBe('save-your-tears');
  });

  it('handles special characters', () => {
    expect(generateBaseSlug("Can't Feel My Face")).toBe('cant-feel-my-face');
    expect(generateBaseSlug('Song (Remix)')).toBe('song-remix');
    expect(generateBaseSlug('Track #1')).toBe('track-1');
  });

  it('normalizes unicode characters', () => {
    expect(generateBaseSlug('Für Elise')).toBe('fur-elise');
    expect(generateBaseSlug('Café del Mar')).toBe('cafe-del-mar');
    expect(generateBaseSlug('Señorita')).toBe('senorita');
  });

  it('collapses multiple hyphens', () => {
    expect(generateBaseSlug('Hello - - - World')).toBe('hello-world');
    expect(generateBaseSlug('Test   Multiple   Spaces')).toBe(
      'test-multiple-spaces'
    );
  });

  it('removes leading and trailing hyphens', () => {
    expect(generateBaseSlug('  Padded Title  ')).toBe('padded-title');
    expect(generateBaseSlug('---Hyphen Start')).toBe('hyphen-start');
  });

  it('enforces max length', () => {
    const longTitle =
      'This Is A Very Long Song Title That Should Be Truncated To Fit';
    const slug = generateBaseSlug(longTitle, 20);
    expect(slug.length).toBeLessThanOrEqual(20);
    expect(slug).toBe('this-is-a-very-long-');
  });

  it('handles edge cases', () => {
    expect(generateBaseSlug('')).toBe('');
    expect(generateBaseSlug('   ')).toBe('');
    expect(generateBaseSlug('123')).toBe('123');
    expect(generateBaseSlug('UPPERCASE')).toBe('uppercase');
  });
});
