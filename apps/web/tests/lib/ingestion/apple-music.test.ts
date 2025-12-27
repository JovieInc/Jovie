import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  extractAppleMusic,
  extractAppleMusicArtistId,
  fetchAppleMusicDocument,
  isAppleMusicUrl,
  validateAppleMusicUrl,
} from '@/lib/ingestion/strategies/apple-music';
import { ExtractionError } from '@/lib/ingestion/strategies/base';

const readFixture = (name: string) =>
  readFileSync(path.join(__dirname, 'fixtures', 'apple-music', name), 'utf-8');

describe('Apple Music Strategy', () => {
  describe('isAppleMusicUrl', () => {
    it('accepts valid Apple Music artist URLs', () => {
      expect(
        isAppleMusicUrl(
          'https://music.apple.com/us/artist/taylor-swift/159260351'
        )
      ).toBe(true);
      expect(
        isAppleMusicUrl('https://music.apple.com/gb/artist/adele/262836961')
      ).toBe(true);
      expect(
        isAppleMusicUrl(
          'https://music.apple.com/jp/artist/utada-hikaru/18756224'
        )
      ).toBe(true);
      expect(
        isAppleMusicUrl(
          'https://www.music.apple.com/us/artist/the-weeknd/479756766'
        )
      ).toBe(true);
    });

    it('accepts URLs with various regions', () => {
      expect(
        isAppleMusicUrl('https://music.apple.com/us/artist/artist-name/123456')
      ).toBe(true);
      expect(
        isAppleMusicUrl('https://music.apple.com/uk/artist/artist-name/123456')
      ).toBe(true);
      expect(
        isAppleMusicUrl('https://music.apple.com/jp/artist/artist-name/123456')
      ).toBe(true);
      expect(
        isAppleMusicUrl('https://music.apple.com/ca/artist/artist-name/123456')
      ).toBe(true);
      expect(
        isAppleMusicUrl('https://music.apple.com/aus/artist/artist-name/123456')
      ).toBe(true);
    });

    it('rejects HTTP URLs', () => {
      expect(
        isAppleMusicUrl(
          'http://music.apple.com/us/artist/taylor-swift/159260351'
        )
      ).toBe(false);
    });

    it('rejects non-artist URLs', () => {
      expect(
        isAppleMusicUrl('https://music.apple.com/us/album/midnights/1649434004')
      ).toBe(false);
      expect(
        isAppleMusicUrl(
          'https://music.apple.com/us/playlist/todays-hits/pl.f4d106fed2bd41149aaacabb233eb5eb'
        )
      ).toBe(false);
      expect(isAppleMusicUrl('https://music.apple.com/us/browse')).toBe(false);
    });

    it('rejects root URLs without artist path', () => {
      expect(isAppleMusicUrl('https://music.apple.com/')).toBe(false);
      expect(isAppleMusicUrl('https://music.apple.com')).toBe(false);
      expect(isAppleMusicUrl('https://music.apple.com/us')).toBe(false);
    });

    it('rejects invalid hosts', () => {
      expect(
        isAppleMusicUrl('https://fake-music.apple.com/us/artist/test/123')
      ).toBe(false);
      expect(
        isAppleMusicUrl('https://music.apple.com.fake.com/us/artist/test/123')
      ).toBe(false);
      expect(
        isAppleMusicUrl(
          'https://example.com/music.apple.com/us/artist/test/123'
        )
      ).toBe(false);
    });

    it('rejects URLs without artist ID', () => {
      expect(
        isAppleMusicUrl('https://music.apple.com/us/artist/taylor-swift')
      ).toBe(false);
      expect(isAppleMusicUrl('https://music.apple.com/us/artist/')).toBe(false);
    });

    it('handles malformed URLs gracefully', () => {
      expect(isAppleMusicUrl('')).toBe(false);
      expect(isAppleMusicUrl('not-a-url')).toBe(false);
      expect(isAppleMusicUrl('://music.apple.com/us/artist/test/123')).toBe(
        false
      );
    });

    it('rejects dangerous URL schemes', () => {
      expect(isAppleMusicUrl('javascript:alert(1)')).toBe(false);
      expect(isAppleMusicUrl('data:text/html,<script>alert(1)</script>')).toBe(
        false
      );
      expect(isAppleMusicUrl('file:///etc/passwd')).toBe(false);
    });

    it('rejects protocol-relative URLs', () => {
      expect(isAppleMusicUrl('//music.apple.com/us/artist/test/123')).toBe(
        false
      );
    });
  });

  describe('validateAppleMusicUrl', () => {
    it('returns canonical URL for valid inputs', () => {
      expect(
        validateAppleMusicUrl(
          'https://music.apple.com/us/artist/taylor-swift/159260351'
        )
      ).toBe('https://music.apple.com/us/artist/taylor-swift/159260351');
      expect(
        validateAppleMusicUrl(
          'https://www.music.apple.com/US/artist/TAYLOR-SWIFT/159260351'
        )
      ).toBe('https://music.apple.com/us/artist/taylor-swift/159260351');
    });

    it('normalizes to lowercase', () => {
      expect(
        validateAppleMusicUrl(
          'https://music.apple.com/US/artist/Taylor-Swift/159260351'
        )
      ).toBe('https://music.apple.com/us/artist/taylor-swift/159260351');
    });

    it('removes www prefix', () => {
      expect(
        validateAppleMusicUrl(
          'https://www.music.apple.com/us/artist/test/123456'
        )
      ).toBe('https://music.apple.com/us/artist/test/123456');
    });

    it('returns null for invalid URLs', () => {
      expect(
        validateAppleMusicUrl('http://music.apple.com/us/artist/test/123')
      ).toBeNull();
      expect(
        validateAppleMusicUrl('https://example.com/artist/test/123')
      ).toBeNull();
      expect(
        validateAppleMusicUrl('https://music.apple.com/us/album/test/123')
      ).toBeNull();
    });

    it('returns null for malformed URLs', () => {
      expect(validateAppleMusicUrl('')).toBeNull();
      expect(validateAppleMusicUrl('not-a-url')).toBeNull();
    });

    it('returns null for dangerous schemes', () => {
      expect(validateAppleMusicUrl('javascript:alert(1)')).toBeNull();
      expect(validateAppleMusicUrl('data:text/html,test')).toBeNull();
    });
  });

  describe('extractAppleMusicArtistId', () => {
    it('extracts artist ID from valid URLs', () => {
      expect(
        extractAppleMusicArtistId(
          'https://music.apple.com/us/artist/taylor-swift/159260351'
        )
      ).toBe('159260351');
      expect(
        extractAppleMusicArtistId(
          'https://music.apple.com/gb/artist/adele/262836961'
        )
      ).toBe('262836961');
    });

    it('extracts artist ID with www prefix', () => {
      expect(
        extractAppleMusicArtistId(
          'https://www.music.apple.com/us/artist/test/123456'
        )
      ).toBe('123456');
    });

    it('returns null for invalid URLs', () => {
      expect(
        extractAppleMusicArtistId('https://example.com/artist/test/123')
      ).toBeNull();
      expect(
        extractAppleMusicArtistId('https://music.apple.com/us/album/test/123')
      ).toBeNull();
    });

    it('returns null for URLs without artist ID', () => {
      expect(
        extractAppleMusicArtistId(
          'https://music.apple.com/us/artist/taylor-swift'
        )
      ).toBeNull();
    });

    it('returns null for malformed URLs', () => {
      expect(extractAppleMusicArtistId('')).toBeNull();
      expect(extractAppleMusicArtistId('not-a-url')).toBeNull();
    });
  });

  describe('extractAppleMusic', () => {
    it('extracts display name from og:title', () => {
      const html = `
        <html>
          <head>
            <meta property="og:title" content="John Doe - Apple Music">
          </head>
        </html>
      `;
      const result = extractAppleMusic(html);
      expect(result.displayName).toBe('John Doe');
    });

    it('extracts display name from twitter:title', () => {
      const html = `
        <html>
          <head>
            <meta name="twitter:title" content="Jane Smith on Apple Music">
          </head>
        </html>
      `;
      const result = extractAppleMusic(html);
      expect(result.displayName).toBe('Jane Smith');
    });

    it('cleans platform suffix from display name', () => {
      const testCases = [
        { input: 'Artist - Apple Music', expected: 'Artist' },
        { input: 'Artist | Apple Music', expected: 'Artist' },
        { input: 'Artist on Apple Music', expected: 'Artist' },
        { input: 'Artist Apple Music', expected: 'Artist' },
      ];

      for (const { input, expected } of testCases) {
        const html = `<html><head><meta property="og:title" content="${input}"></head></html>`;
        const result = extractAppleMusic(html);
        expect(result.displayName).toBe(expected);
      }
    });

    it('extracts avatar from og:image', () => {
      const html = `
        <html>
          <head>
            <meta property="og:image" content="https://example.com/avatar.jpg">
          </head>
        </html>
      `;
      const result = extractAppleMusic(html);
      expect(result.avatarUrl).toBe('https://example.com/avatar.jpg');
    });

    it('skips default Apple Music placeholder images', () => {
      const html = `
        <html>
          <head>
            <meta property="og:image" content="https://example.com/default-avatar.png">
          </head>
        </html>
      `;
      const result = extractAppleMusic(html);
      expect(result.avatarUrl).toBeNull();
    });

    it('extracts links from JSON-LD sameAs property', () => {
      const html = `
        <html>
          <head>
            <script type="application/ld+json">
              {
                "@type": "MusicGroup",
                "name": "Test Artist",
                "sameAs": [
                  "https://instagram.com/testartist",
                  "https://twitter.com/testartist"
                ]
              }
            </script>
          </head>
        </html>
      `;
      const result = extractAppleMusic(html);
      expect(result.links.some(l => l.platformId === 'instagram')).toBe(true);
      expect(result.links.some(l => l.platformId === 'twitter')).toBe(true);
    });

    it('extracts links from data-href attributes', () => {
      const html = `
        <html>
          <body>
            <div data-href="https://youtube.com/@testartist">YouTube</div>
            <div data-url="https://tiktok.com/@testartist">TikTok</div>
          </body>
        </html>
      `;
      const result = extractAppleMusic(html);
      // YouTube @handle URLs are detected as youtube_music by platform detection
      expect(result.links.some(l => l.platformId === 'youtube_music')).toBe(
        true
      );
      expect(result.links.some(l => l.platformId === 'tiktok')).toBe(true);
    });

    it('extracts external links from href attributes', () => {
      const html = `
        <html>
          <body>
            <a href="https://instagram.com/johndoe">Instagram</a>
            <a href="https://twitter.com/johndoe">Twitter</a>
            <a href="https://music.apple.com/us/artist/other/123">Internal Link</a>
          </body>
        </html>
      `;
      const result = extractAppleMusic(html);
      expect(result.links.some(l => l.platformId === 'instagram')).toBe(true);
      expect(result.links.some(l => l.platformId === 'twitter')).toBe(true);
    });

    it('skips internal Apple Music links', () => {
      const html = `
        <html>
          <body>
            <a href="https://music.apple.com/us/artist/other/123">Other Artist</a>
            <a href="https://music.apple.com/us/album/test/456">Album</a>
            <a href="https://www.music.apple.com/us/browse">Browse</a>
          </body>
        </html>
      `;
      const result = extractAppleMusic(html);
      expect(result.links.length).toBe(0);
    });

    it('skips Apple internal domains', () => {
      const html = `
        <html>
          <body>
            <a href="https://apple.com/music">Apple.com</a>
            <a href="https://apps.apple.com/app/music">App Store</a>
            <a href="https://itunes.apple.com/artist/123">iTunes</a>
            <a href="https://support.apple.com/apple-music">Support</a>
          </body>
        </html>
      `;
      const result = extractAppleMusic(html);
      expect(result.links.length).toBe(0);
    });

    it('deduplicates links', () => {
      const html = `
        <html>
          <body>
            <a href="https://instagram.com/johndoe">Instagram 1</a>
            <a href="https://instagram.com/johndoe">Instagram 2</a>
            <a href="https://www.instagram.com/johndoe">Instagram 3</a>
          </body>
        </html>
      `;
      const result = extractAppleMusic(html);
      const instagramLinks = result.links.filter(
        l => l.platformId === 'instagram'
      );
      expect(instagramLinks.length).toBe(1);
    });

    it('handles empty HTML gracefully', () => {
      const result = extractAppleMusic('');
      expect(result.links).toEqual([]);
      expect(result.displayName).toBeNull();
      expect(result.avatarUrl).toBeNull();
    });

    it('handles malformed HTML gracefully', () => {
      const html = '<html><head><meta property="og:title" content="Test"';
      const result = extractAppleMusic(html);
      expect(result).toBeDefined();
    });

    it('extracts data from structured fixture', () => {
      const html = readFixture('structured.html');
      const result = extractAppleMusic(html);

      expect(result.displayName).toBe('Aria Waves');
      // Avatar should be extracted from meta tags
      expect(result.avatarUrl).toBeTruthy();

      const platforms = result.links.map(link => link.platformId).sort();
      // Should include links from JSON-LD sameAs, data attributes, and hrefs
      expect(platforms).toContain('instagram');
      expect(platforms).toContain('twitter');
      expect(platforms).toContain('spotify');
      // YouTube @handle URLs are detected as youtube_music by platform detection
      expect(platforms).toContain('youtube_music');
      expect(platforms).toContain('tiktok');
      expect(platforms).toContain('soundcloud');

      // Internal Apple Music URLs should be ignored
      expect(
        result.links.some(link => link.url.includes('music.apple.com'))
      ).toBe(false);
      expect(
        result.links.some(link => link.url.includes('apple.com/music'))
      ).toBe(false);
    });

    it('handles edge cases correctly', () => {
      const html = readFixture('edge-case.html');
      const result = extractAppleMusic(html);

      expect(result.displayName).toBe('Edge Artist');
      // Default avatar should be filtered out
      expect(result.avatarUrl).toBeNull();

      const platforms = result.links.map(link => link.platformId).sort();
      // Should only include valid HTTPS links to non-Apple domains
      expect(platforms).toContain('instagram');
      expect(platforms).toContain('tiktok');
      expect(platforms).toContain('soundcloud');

      // HTTP links should be skipped
      // Apple internal domains should be skipped
      expect(
        result.links.some(link => link.url.includes('apps.apple.com'))
      ).toBe(false);
      expect(
        result.links.some(link => link.url.includes('itunes.apple.com'))
      ).toBe(false);
      expect(
        result.links.some(link => link.url.includes('support.apple.com'))
      ).toBe(false);
    });

    it('handles minimal data gracefully', () => {
      const html = readFixture('minimal.html');
      const result = extractAppleMusic(html);

      expect(result.displayName).toBe('Minimal Artist');
      expect(result.avatarUrl).toBeNull();
      expect(result.links.length).toBe(0);
    });
  });

  describe('fetchAppleMusicDocument', () => {
    beforeEach(() => {
      vi.stubGlobal('fetch', vi.fn());
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('throws ExtractionError for invalid URL', async () => {
      await expect(
        fetchAppleMusicDocument('https://example.com/artist')
      ).rejects.toThrow(ExtractionError);
    });

    it('throws ExtractionError for non-artist URL', async () => {
      await expect(
        fetchAppleMusicDocument('https://music.apple.com/us/album/test/123')
      ).rejects.toThrow(ExtractionError);
    });

    it('throws ExtractionError on 404', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      } as Response);

      await expect(
        fetchAppleMusicDocument('https://music.apple.com/us/artist/test/123456')
      ).rejects.toThrow(ExtractionError);
    });

    it('throws ExtractionError on 429 rate limit', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
      } as Response);

      await expect(
        fetchAppleMusicDocument('https://music.apple.com/us/artist/test/123456')
      ).rejects.toThrow(ExtractionError);
    });

    it('returns HTML on success', async () => {
      const mockHtml = '<html><body>Apple Music Artist Page</body></html>';
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: () => Promise.resolve(mockHtml),
        url: 'https://music.apple.com/us/artist/test/123456',
        headers: new Headers({ 'content-type': 'text/html' }),
      } as Response);

      const result = await fetchAppleMusicDocument(
        'https://music.apple.com/us/artist/test/123456'
      );
      expect(result).toBe(mockHtml);
    });
  });
});
