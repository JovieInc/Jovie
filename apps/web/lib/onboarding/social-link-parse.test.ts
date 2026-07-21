import { describe, expect, it } from 'vitest';
import {
  isCompleteSocialUrl,
  parseInstagramInput,
  parseSocialLinkInput,
} from './social-link-parse';

describe('parseInstagramInput', () => {
  it('builds a full profile URL from a bare handle', () => {
    expect(parseInstagramInput('davidguetta')).toEqual({
      ok: true,
      platform: 'instagram',
      handle: 'davidguetta',
      url: 'https://www.instagram.com/davidguetta/',
    });
  });

  it('accepts @handles', () => {
    const result = parseInstagramInput('@calvinharris');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.handle).toBe('calvinharris');
      expect(result.url).toBe('https://www.instagram.com/calvinharris/');
    }
  });

  it('rejects bare instagram.com without an account path', () => {
    for (const input of [
      'instagram.com',
      'www.instagram.com',
      'https://instagram.com',
      'https://www.instagram.com',
      'https://www.instagram.com/',
      'http://instagram.com/',
    ]) {
      const result = parseInstagramInput(input);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe('missing_account_path');
      }
    }
  });

  it('normalizes full URLs that include a path', () => {
    const result = parseInstagramInput('https://instagram.com/timwhite/');
    expect(result).toEqual({
      ok: true,
      platform: 'instagram',
      handle: 'timwhite',
      url: 'https://www.instagram.com/timwhite/',
    });
  });

  it('rejects reserved Instagram path segments', () => {
    const result = parseInstagramInput('https://www.instagram.com/reels/');
    expect(result.ok).toBe(false);
  });
});

describe('parseSocialLinkInput', () => {
  it('routes Instagram-looking inputs through the Instagram parser', () => {
    expect(parseSocialLinkInput('https://instagram.com/foo').ok).toBe(true);
    expect(parseSocialLinkInput('instagram.com').ok).toBe(false);
  });

  it('rejects other bare social hosts without a path', () => {
    expect(parseSocialLinkInput('https://tiktok.com').ok).toBe(false);
    expect(parseSocialLinkInput('https://x.com/').ok).toBe(false);
  });

  it('accepts TikTok and X profile paths', () => {
    const tiktok = parseSocialLinkInput('https://www.tiktok.com/@artist');
    expect(tiktok.ok).toBe(true);
    if (tiktok.ok) {
      expect(tiktok.platform).toBe('tiktok');
      expect(tiktok.url).toContain('@artist');
    }

    const x = parseSocialLinkInput('https://twitter.com/artist');
    expect(x.ok).toBe(true);
    if (x.ok) {
      expect(x.platform).toBe('x');
      expect(x.url).toBe('https://x.com/artist');
    }
  });

  it('isCompleteSocialUrl mirrors parse success', () => {
    expect(isCompleteSocialUrl('https://www.instagram.com/a/')).toBe(true);
    expect(isCompleteSocialUrl('instagram.com')).toBe(false);
  });
});
