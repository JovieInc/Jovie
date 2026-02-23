import { describe, expect, it } from 'vitest';
import { appendUTMParamsToUrl, extractUTMParams } from '@/lib/utm';

describe('UTM URL helpers', () => {
  describe('extractUTMParams', () => {
    it('extracts only supported UTM params and trims values', () => {
      const params = new URLSearchParams({
        utm_source: ' instagram ',
        utm_medium: 'story',
        utm_campaign: 'spring-drop',
        utm_term: ' ',
        utm_content: 'link_a',
        foo: 'bar',
      });

      expect(extractUTMParams(params)).toEqual({
        utm_source: 'instagram',
        utm_medium: 'story',
        utm_campaign: 'spring-drop',
        utm_content: 'link_a',
      });
    });
  });

  describe('appendUTMParamsToUrl', () => {
    it('appends UTM params to absolute URLs', () => {
      expect(
        appendUTMParamsToUrl('https://open.spotify.com/track/123', {
          utm_source: 'instagram',
          utm_medium: 'story',
        })
      ).toBe(
        'https://open.spotify.com/track/123?utm_source=instagram&utm_medium=story'
      );
    });

    it('appends UTM params to relative paths', () => {
      expect(
        appendUTMParamsToUrl('/artist/song', {
          utm_campaign: 'release_week',
        })
      ).toBe('/artist/song?utm_campaign=release_week');
    });

    it('returns original URL when no non-empty UTM params exist', () => {
      expect(
        appendUTMParamsToUrl('https://example.com/path?foo=bar', {
          utm_source: '   ',
        })
      ).toBe('https://example.com/path?foo=bar');
    });
  });
});
