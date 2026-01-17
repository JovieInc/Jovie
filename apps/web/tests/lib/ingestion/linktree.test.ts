import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ExtractionError } from '@/lib/ingestion/strategies/base';
import {
  extractLinktree,
  extractLinktreeHandle,
  fetchLinktreeDocument,
  isLinktreeUrl,
  isValidHandle,
  normalizeHandle,
  validateLinktreeUrl,
} from '@/lib/ingestion/strategies/linktree';

// Load fixtures at module scope to avoid I/O overhead in tests
const FIXTURES = {
  structured: readFileSync(
    path.join(__dirname, 'fixtures', 'linktree', 'structured.html'),
    'utf-8'
  ),
  edgeCase: readFileSync(
    path.join(__dirname, 'fixtures', 'linktree', 'edge-case.html'),
    'utf-8'
  ),
} as const;

describe('Linktree Strategy', () => {
  describe('isLinktreeUrl', () => {
    it('accepts valid linktr.ee URLs', () => {
      expect(isLinktreeUrl('https://linktr.ee/username')).toBe(true);
      expect(isLinktreeUrl('https://linktr.ee/user_name')).toBe(true);
      expect(isLinktreeUrl('https://linktr.ee/user123')).toBe(true);
      expect(isLinktreeUrl('https://www.linktr.ee/username')).toBe(true);
    });

    it('accepts valid linktree.com URLs', () => {
      expect(isLinktreeUrl('https://linktree.com/username')).toBe(true);
      expect(isLinktreeUrl('https://www.linktree.com/username')).toBe(true);
    });

    it('rejects HTTP URLs', () => {
      expect(isLinktreeUrl('http://linktr.ee/username')).toBe(false);
    });

    it('rejects root URLs without handle', () => {
      expect(isLinktreeUrl('https://linktr.ee/')).toBe(false);
      expect(isLinktreeUrl('https://linktr.ee')).toBe(false);
    });

    it('rejects invalid hosts', () => {
      expect(isLinktreeUrl('https://fake-linktr.ee/username')).toBe(false);
      expect(isLinktreeUrl('https://linktr.ee.fake.com/username')).toBe(false);
      expect(isLinktreeUrl('https://example.com/linktr.ee/username')).toBe(
        false
      );
    });

    it('rejects invalid handles', () => {
      // Single char handles are actually valid per Linktree's rules
      expect(isLinktreeUrl('https://linktr.ee/a')).toBe(true);
      // Hyphens not allowed
      expect(isLinktreeUrl('https://linktr.ee/user-name')).toBe(false);
      // Dots not allowed
      expect(isLinktreeUrl('https://linktr.ee/user.name')).toBe(false);
    });

    it('handles malformed URLs gracefully', () => {
      expect(isLinktreeUrl('')).toBe(false);
      expect(isLinktreeUrl('not-a-url')).toBe(false);
      expect(isLinktreeUrl('://linktr.ee/username')).toBe(false);
    });
  });

  describe('validateLinktreeUrl', () => {
    it('returns canonical URL for valid inputs', () => {
      expect(validateLinktreeUrl('https://linktr.ee/username')).toBe(
        'https://linktr.ee/username'
      );
      expect(validateLinktreeUrl('https://www.linktr.ee/USERNAME')).toBe(
        'https://linktr.ee/username'
      );
      expect(validateLinktreeUrl('https://linktree.com/user_name')).toBe(
        'https://linktr.ee/user_name'
      );
    });

    it('returns null for invalid URLs', () => {
      expect(validateLinktreeUrl('http://linktr.ee/username')).toBeNull();
      expect(validateLinktreeUrl('https://example.com/username')).toBeNull();
      expect(validateLinktreeUrl('https://linktr.ee/')).toBeNull();
    });

    it('strips @ prefix from handles', () => {
      expect(validateLinktreeUrl('https://linktr.ee/@username')).toBe(
        'https://linktr.ee/username'
      );
    });
  });

  describe('isValidHandle', () => {
    it('accepts valid handles', () => {
      expect(isValidHandle('ab')).toBe(true);
      expect(isValidHandle('abc')).toBe(true);
      expect(isValidHandle('user_name')).toBe(true);
      expect(isValidHandle('user123')).toBe(true);
      expect(isValidHandle('a1b2c3')).toBe(true);
    });

    it('rejects handles with invalid characters', () => {
      expect(isValidHandle('user-name')).toBe(false);
      expect(isValidHandle('user.name')).toBe(false);
      expect(isValidHandle('user name')).toBe(false);
      expect(isValidHandle('user@name')).toBe(false);
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

  describe('extractLinktreeHandle', () => {
    it('extracts handle from valid URLs', () => {
      expect(extractLinktreeHandle('https://linktr.ee/username')).toBe(
        'username'
      );
      expect(extractLinktreeHandle('https://linktr.ee/user_name')).toBe(
        'user_name'
      );
      expect(extractLinktreeHandle('https://www.linktr.ee/username')).toBe(
        'username'
      );
    });

    it('normalizes handles to lowercase', () => {
      expect(extractLinktreeHandle('https://linktr.ee/USERNAME')).toBe(
        'username'
      );
    });

    it('strips @ prefix', () => {
      expect(extractLinktreeHandle('https://linktr.ee/@username')).toBe(
        'username'
      );
    });

    it('returns null for invalid URLs', () => {
      expect(extractLinktreeHandle('https://example.com/username')).toBeNull();
      expect(extractLinktreeHandle('https://linktr.ee/')).toBeNull();
      expect(extractLinktreeHandle('not-a-url')).toBeNull();
    });

    it('handles URLs with trailing slashes and paths', () => {
      expect(extractLinktreeHandle('https://linktr.ee/username/')).toBe(
        'username'
      );
      expect(extractLinktreeHandle('https://linktr.ee/username/extra')).toBe(
        'username'
      );
    });
  });

  describe('extractLinktree', () => {
    it('extracts display name from og:title', () => {
      const html = `
        <html>
          <head>
            <meta property="og:title" content="John Doe | Linktree">
          </head>
        </html>
      `;
      const result = extractLinktree(html);
      expect(result.displayName).toBe('John Doe');
    });

    it('extracts display name from twitter:title', () => {
      const html = `
        <html>
          <head>
            <meta name="twitter:title" content="Jane Smith - Linktree">
          </head>
        </html>
      `;
      const result = extractLinktree(html);
      expect(result.displayName).toBe('Jane Smith');
    });

    it('extracts avatar from og:image', () => {
      const html = `
        <html>
          <head>
            <meta property="og:image" content="https://example.com/avatar.jpg">
          </head>
        </html>
      `;
      const result = extractLinktree(html);
      expect(result.avatarUrl).toBe('https://example.com/avatar.jpg');
    });

    it('extracts external links', () => {
      const html = `
        <html>
          <body>
            <a href="https://instagram.com/johndoe">Instagram</a>
            <a href="https://twitter.com/johndoe">Twitter</a>
            <a href="https://linktr.ee/other">Internal Link</a>
          </body>
        </html>
      `;
      const result = extractLinktree(html);
      // Should extract Instagram and Twitter, but not internal Linktree links
      expect(result.links.length).toBeGreaterThanOrEqual(2);
      expect(result.links.some(l => l.platformId === 'instagram')).toBe(true);
      expect(result.links.some(l => l.platformId === 'twitter')).toBe(true);
    });

    it('skips internal Linktree links', () => {
      const html = `
        <html>
          <body>
            <a href="https://linktr.ee/other">Other Profile</a>
            <a href="https://www.linktr.ee/another">Another Profile</a>
          </body>
        </html>
      `;
      const result = extractLinktree(html);
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
      const result = extractLinktree(html);
      const instagramLinks = result.links.filter(
        l => l.platformId === 'instagram'
      );
      expect(instagramLinks.length).toBe(1);
    });

    it('handles empty HTML gracefully', () => {
      const result = extractLinktree('');
      expect(result.links).toEqual([]);
      expect(result.displayName).toBeNull();
      expect(result.avatarUrl).toBeNull();
    });

    it('handles malformed HTML gracefully', () => {
      const html = '<html><head><meta property="og:title" content="Test"';
      const result = extractLinktree(html);
      // Should not throw, may or may not extract data depending on regex
      expect(result).toBeDefined();
    });

    it('prefers structured Next.js data when available', () => {
      const html = FIXTURES.structured;
      const result = extractLinktree(html);

      expect(result.displayName).toBe('Casey Stone');
      expect(result.avatarUrl).toBe('https://cdn.linktr.ee/profiles/casey.jpg');

      const platforms = result.links.map(link => link.platformId).sort();
      expect(platforms).toEqual([
        'instagram',
        'spotify',
        'twitter',
        'youtube_music',
      ]);
      expect(
        result.links.some(link => {
          try {
            return new URL(link.url).host === 'open.spotify.com';
          } catch {
            return false;
          }
        })
      ).toBe(true);
      // Internal Linktree URLs should be ignored
      expect(
        result.links.some(link => link.url.includes('linktr.ee/internal'))
      ).toBe(false);
    });

    it('falls back to href scanning when structured data is missing', () => {
      const html = FIXTURES.edgeCase;
      const result = extractLinktree(html);

      const platforms = result.links.map(link => link.platformId).sort();
      expect(platforms).toEqual(['instagram', 'tiktok']);
    });
  });

  describe('fetchLinktreeDocument', () => {
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
        fetchLinktreeDocument('https://example.com/user')
      ).rejects.toThrow(ExtractionError);
    });

    it('throws ExtractionError on 404', async () => {
      // Use mockResolvedValue (not Once) to handle all retry attempts
      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        url: 'https://linktr.ee/username',
        headers: new Headers(),
      } as Response);

      await expect(
        fetchLinktreeDocument('https://linktr.ee/username')
      ).rejects.toThrow(ExtractionError);
    });

    it('throws ExtractionError on 429 rate limit', async () => {
      // Use mockResolvedValue (not Once) to handle all retry attempts
      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        url: 'https://linktr.ee/username',
        headers: new Headers(),
      } as Response);

      await expect(
        fetchLinktreeDocument('https://linktr.ee/username')
      ).rejects.toThrow(ExtractionError);
    });

    it('returns HTML on success', async () => {
      const mockHtml = '<html><body>Test</body></html>';
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: () => Promise.resolve(mockHtml),
        url: 'https://linktr.ee/username',
        headers: new Headers({ 'content-type': 'text/html' }),
      } as Response);

      const result = await fetchLinktreeDocument('https://linktr.ee/username');
      expect(result).toBe(mockHtml);
    });
  });
});
