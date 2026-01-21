import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ExtractionError } from '@/lib/ingestion/strategies/base';
import {
  extractBeacons,
  extractBeaconsHandle,
  fetchBeaconsDocument,
  isBeaconsUrl,
  isValidHandle,
  normalizeHandle,
  validateBeaconsUrl,
} from '@/lib/ingestion/strategies/beacons';

// Load fixtures at module scope to avoid I/O overhead in tests
const FIXTURES = {
  structured: readFileSync(
    path.join(__dirname, 'fixtures', 'beacons', 'structured.html'),
    'utf-8'
  ),
  edgeCase: readFileSync(
    path.join(__dirname, 'fixtures', 'beacons', 'edge-case.html'),
    'utf-8'
  ),
} as const;

describe('Beacons Strategy', () => {
  describe('isBeaconsUrl', () => {
    it('accepts valid beacons.ai URLs', () => {
      expect(isBeaconsUrl('https://beacons.ai/username')).toBe(true);
      expect(isBeaconsUrl('https://beacons.ai/user_name')).toBe(true);
      expect(isBeaconsUrl('https://beacons.ai/user123')).toBe(true);
      expect(isBeaconsUrl('https://www.beacons.ai/username')).toBe(true);
    });

    it('accepts valid beacons.page URLs', () => {
      expect(isBeaconsUrl('https://beacons.page/username')).toBe(true);
      expect(isBeaconsUrl('https://www.beacons.page/username')).toBe(true);
    });

    it('rejects HTTP URLs', () => {
      expect(isBeaconsUrl('http://beacons.ai/username')).toBe(false);
    });

    it('rejects root URLs without handle', () => {
      expect(isBeaconsUrl('https://beacons.ai/')).toBe(false);
      expect(isBeaconsUrl('https://beacons.ai')).toBe(false);
    });

    it('rejects invalid hosts', () => {
      expect(isBeaconsUrl('https://fake-beacons.ai/username')).toBe(false);
      expect(isBeaconsUrl('https://beacons.ai.fake.com/username')).toBe(false);
      expect(isBeaconsUrl('https://example.com/beacons.ai/username')).toBe(
        false
      );
    });

    it('rejects reserved paths', () => {
      expect(isBeaconsUrl('https://beacons.ai/login')).toBe(false);
      expect(isBeaconsUrl('https://beacons.ai/signup')).toBe(false);
      expect(isBeaconsUrl('https://beacons.ai/dashboard')).toBe(false);
      expect(isBeaconsUrl('https://beacons.ai/pricing')).toBe(false);
      expect(isBeaconsUrl('https://beacons.ai/api')).toBe(false);
    });

    it('handles malformed URLs gracefully', () => {
      expect(isBeaconsUrl('')).toBe(false);
      expect(isBeaconsUrl('not-a-url')).toBe(false);
      expect(isBeaconsUrl('://beacons.ai/username')).toBe(false);
    });
  });

  describe('validateBeaconsUrl', () => {
    it('returns canonical URL for valid inputs', () => {
      expect(validateBeaconsUrl('https://beacons.ai/username')).toBe(
        'https://beacons.ai/username'
      );
      expect(validateBeaconsUrl('https://www.beacons.ai/USERNAME')).toBe(
        'https://beacons.ai/username'
      );
      expect(validateBeaconsUrl('https://beacons.page/user_name')).toBe(
        'https://beacons.ai/user_name'
      );
    });

    it('returns null for invalid URLs', () => {
      expect(validateBeaconsUrl('http://beacons.ai/username')).toBeNull();
      expect(validateBeaconsUrl('https://example.com/username')).toBeNull();
      expect(validateBeaconsUrl('https://beacons.ai/')).toBeNull();
    });

    it('returns null for reserved paths', () => {
      expect(validateBeaconsUrl('https://beacons.ai/login')).toBeNull();
      expect(validateBeaconsUrl('https://beacons.ai/admin')).toBeNull();
    });

    it('strips @ prefix from handles', () => {
      expect(validateBeaconsUrl('https://beacons.ai/@username')).toBe(
        'https://beacons.ai/username'
      );
    });
  });

  describe('isValidHandle', () => {
    it('accepts valid handles', () => {
      expect(isValidHandle('ab')).toBe(true);
      expect(isValidHandle('abc')).toBe(true);
      expect(isValidHandle('user_name')).toBe(true);
      expect(isValidHandle('user.name')).toBe(true); // Beacons allows dots
      expect(isValidHandle('user123')).toBe(true);
    });

    it('rejects reserved handles', () => {
      expect(isValidHandle('login')).toBe(false);
      expect(isValidHandle('signup')).toBe(false);
      expect(isValidHandle('dashboard')).toBe(false);
      expect(isValidHandle('admin')).toBe(false);
      expect(isValidHandle('api')).toBe(false);
    });

    it('rejects handles that are too long', () => {
      expect(isValidHandle('a'.repeat(31))).toBe(false);
    });

    it('rejects empty handles', () => {
      expect(isValidHandle('')).toBe(false);
    });
  });

  describe('normalizeHandle', () => {
    it('lowercases handles', () => {
      expect(normalizeHandle('USERNAME')).toBe('username');
      expect(normalizeHandle('UserName')).toBe('username');
    });

    it('strips @ prefix', () => {
      expect(normalizeHandle('@username')).toBe('username');
    });

    it('trims whitespace', () => {
      expect(normalizeHandle('  username  ')).toBe('username');
    });
  });

  describe('extractBeaconsHandle', () => {
    it('extracts handle from valid URLs', () => {
      expect(extractBeaconsHandle('https://beacons.ai/username')).toBe(
        'username'
      );
      expect(extractBeaconsHandle('https://beacons.ai/user_name')).toBe(
        'user_name'
      );
      expect(extractBeaconsHandle('https://www.beacons.ai/username')).toBe(
        'username'
      );
    });

    it('normalizes handles to lowercase', () => {
      expect(extractBeaconsHandle('https://beacons.ai/USERNAME')).toBe(
        'username'
      );
    });

    it('strips @ prefix', () => {
      expect(extractBeaconsHandle('https://beacons.ai/@username')).toBe(
        'username'
      );
    });

    it('returns null for invalid URLs', () => {
      expect(extractBeaconsHandle('https://example.com/username')).toBeNull();
      expect(extractBeaconsHandle('https://beacons.ai/')).toBeNull();
      expect(extractBeaconsHandle('not-a-url')).toBeNull();
    });

    it('returns null for reserved paths', () => {
      expect(extractBeaconsHandle('https://beacons.ai/login')).toBeNull();
      expect(extractBeaconsHandle('https://beacons.ai/dashboard')).toBeNull();
    });

    it('handles URLs with trailing slashes and paths', () => {
      expect(extractBeaconsHandle('https://beacons.ai/username/')).toBe(
        'username'
      );
      expect(extractBeaconsHandle('https://beacons.ai/username/extra')).toBe(
        'username'
      );
    });
  });

  describe('extractBeacons', () => {
    it('extracts display name from og:title', () => {
      const html = `
        <html>
          <head>
            <meta property="og:title" content="John Doe | Beacons">
          </head>
        </html>
      `;
      const result = extractBeacons(html);
      expect(result.displayName).toBe('John Doe');
    });

    it('extracts display name from twitter:title', () => {
      const html = `
        <html>
          <head>
            <meta name="twitter:title" content="Jane Smith on Beacons.ai">
          </head>
        </html>
      `;
      const result = extractBeacons(html);
      expect(result.displayName).toBe('Jane Smith');
    });

    it('cleans up various Beacons suffixes', () => {
      const testCases = [
        { input: 'John Doe | Beacons', expected: 'John Doe' },
        { input: 'John Doe - Beacons.ai', expected: 'John Doe' },
        { input: 'John Doe on Beacons.ai', expected: 'John Doe' },
        { input: "John Doe's Beacons.ai", expected: 'John Doe' },
      ];

      for (const { input, expected } of testCases) {
        const html = `<meta property="og:title" content="${input}">`;
        const result = extractBeacons(html);
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
      const result = extractBeacons(html);
      expect(result.avatarUrl).toBe('https://example.com/avatar.jpg');
    });

    it('skips default Beacons placeholder images', () => {
      const html = `
        <html>
          <head>
            <meta property="og:image" content="https://beacons.ai/default-avatar.png">
          </head>
        </html>
      `;
      const result = extractBeacons(html);
      expect(result.avatarUrl).toBeNull();
    });

    it('extracts external links', () => {
      const html = `
        <html>
          <body>
            <a href="https://instagram.com/johndoe">Instagram</a>
            <a href="https://twitter.com/johndoe">Twitter</a>
            <a href="https://beacons.ai/other">Internal Link</a>
          </body>
        </html>
      `;
      const result = extractBeacons(html);
      // Should extract Instagram and Twitter, but not internal Beacons links
      expect(result.links.length).toBeGreaterThanOrEqual(2);
      expect(result.links.some(l => l.platformId === 'instagram')).toBe(true);
      expect(result.links.some(l => l.platformId === 'twitter')).toBe(true);
    });

    it('skips internal Beacons links', () => {
      const html = `
        <html>
          <body>
            <a href="https://beacons.ai/other">Other Profile</a>
            <a href="https://www.beacons.ai/another">Another Profile</a>
            <a href="https://beacons.page/third">Third Profile</a>
          </body>
        </html>
      `;
      const result = extractBeacons(html);
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
      const result = extractBeacons(html);
      const instagramLinks = result.links.filter(
        l => l.platformId === 'instagram'
      );
      expect(instagramLinks.length).toBe(1);
    });

    it('handles empty HTML gracefully', () => {
      const result = extractBeacons('');
      expect(result.links).toEqual([]);
      expect(result.displayName).toBeNull();
      expect(result.avatarUrl).toBeNull();
    });

    it('sets correct source platform and signal', () => {
      const html = `
        <html>
          <body>
            <a href="https://instagram.com/johndoe">Instagram</a>
          </body>
        </html>
      `;
      const result = extractBeacons(html);
      expect(result.links[0]?.sourcePlatform).toBe('beacons');
      expect(result.links[0]?.evidence?.signals).toContain(
        'beacons_profile_link'
      );
      expect(result.links[0]?.evidence?.sources).toContain('beacons');
    });

    it('prefers structured data sources before href scanning', () => {
      const html = FIXTURES.structured;
      const result = extractBeacons(html);

      const platforms = result.links.map(link => link.platformId).sort();
      expect(platforms).toEqual(['instagram', 'spotify', 'youtube_music']);
      expect(
        result.links.some(link => {
          try {
            return new URL(link.url).hostname === 'open.spotify.com';
          } catch {
            return false;
          }
        })
      ).toBe(true);
      // Should skip internal beacons navigation links
      expect(
        result.links.some(link => link.url.includes('beacons.ai/internal'))
      ).toBe(false);
    });

    it('falls back when structured data is absent', () => {
      const html = FIXTURES.edgeCase;
      const result = extractBeacons(html);

      const platforms = result.links.map(link => link.platformId).sort();
      expect(platforms).toEqual(['instagram', 'soundcloud', 'tiktok']);
    });
  });

  describe('fetchBeaconsDocument', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.stubGlobal('fetch', vi.fn());
    });

    afterEach(async () => {
      // Run any pending timers before cleanup to avoid unhandled rejections
      await vi.runAllTimersAsync();
      vi.useRealTimers();
      vi.unstubAllGlobals();
    });

    it('throws ExtractionError for invalid URL', async () => {
      await expect(
        fetchBeaconsDocument('https://example.com/user')
      ).rejects.toThrow(ExtractionError);
    });

    it('throws ExtractionError for reserved paths', async () => {
      await expect(
        fetchBeaconsDocument('https://beacons.ai/login')
      ).rejects.toThrow(ExtractionError);
    });

    it('throws ExtractionError on 404', async () => {
      // Use mockResolvedValue (not Once) to handle all retry attempts
      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        url: 'https://beacons.ai/username',
        headers: new Headers(),
      } as Response);

      await expect(
        fetchBeaconsDocument('https://beacons.ai/username')
      ).rejects.toThrow(ExtractionError);
    });

    it('throws ExtractionError on 429 rate limit', async () => {
      // Use mockResolvedValue (not Once) to handle all retry attempts
      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        url: 'https://beacons.ai/username',
        headers: new Headers(),
      } as Response);

      await expect(
        fetchBeaconsDocument('https://beacons.ai/username')
      ).rejects.toThrow(ExtractionError);
    });

    it('returns HTML on success', async () => {
      const mockHtml = '<html><body>Test</body></html>';
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: () => Promise.resolve(mockHtml),
        url: 'https://beacons.ai/username',
        headers: new Headers({ 'content-type': 'text/html' }),
      } as Response);

      const result = await fetchBeaconsDocument('https://beacons.ai/username');
      expect(result).toBe(mockHtml);
    });
  });
});
