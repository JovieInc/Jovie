import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ExtractionError,
  extractLinks,
  extractMetaContent,
  fetchDocument,
  isValidHandle,
  normalizeHandle,
  type StrategyConfig,
  stripTrackingParams,
  validatePlatformUrl,
} from '@/lib/ingestion/strategies/base';

describe('Base Extraction Utilities', () => {
  describe('ExtractionError', () => {
    it('creates error with code', () => {
      const error = new ExtractionError('Test error', 'FETCH_FAILED');
      expect(error.message).toBe('Test error');
      expect(error.code).toBe('FETCH_FAILED');
      expect(error.name).toBe('ExtractionError');
    });

    it('creates error with status code', () => {
      const error = new ExtractionError('Not found', 'NOT_FOUND', 404);
      expect(error.statusCode).toBe(404);
    });

    it('creates error with cause', () => {
      const cause = new Error('Original error');
      const error = new ExtractionError(
        'Wrapped',
        'FETCH_FAILED',
        undefined,
        cause
      );
      expect(error.cause).toBe(cause);
    });
  });

  describe('extractMetaContent', () => {
    it('extracts content from property attribute', () => {
      const html = '<meta property="og:title" content="Test Title">';
      expect(extractMetaContent(html, 'og:title')).toBe('Test Title');
    });

    it('extracts content from name attribute', () => {
      const html = '<meta name="twitter:title" content="Twitter Title">';
      expect(extractMetaContent(html, 'twitter:title')).toBe('Twitter Title');
    });

    it('handles content before property', () => {
      const html = '<meta content="Reversed" property="og:title">';
      expect(extractMetaContent(html, 'og:title')).toBe('Reversed');
    });

    it('decodes HTML entities', () => {
      const html = '<meta property="og:title" content="Test &amp; Title">';
      expect(extractMetaContent(html, 'og:title')).toBe('Test & Title');
    });

    it('returns null for missing meta', () => {
      const html = '<html><head></head></html>';
      expect(extractMetaContent(html, 'og:title')).toBeNull();
    });

    it('handles single quotes', () => {
      const html = "<meta property='og:title' content='Single Quotes'>";
      expect(extractMetaContent(html, 'og:title')).toBe('Single Quotes');
    });
  });

  describe('extractLinks', () => {
    const skipHosts = new Set(['linktr.ee', 'www.linktr.ee']);

    it('extracts valid external links', () => {
      const html = `
        <a href="https://instagram.com/user">Instagram</a>
        <a href="https://twitter.com/user">Twitter</a>
      `;
      const links = extractLinks(html, {
        skipHosts,
        sourcePlatform: 'test',
        sourceSignal: 'test_signal',
      });
      expect(links.length).toBe(2);
    });

    it('skips internal platform links', () => {
      const html = `
        <a href="https://linktr.ee/other">Internal</a>
        <a href="https://instagram.com/user">External</a>
      `;
      const links = extractLinks(html, {
        skipHosts,
        sourcePlatform: 'test',
        sourceSignal: 'test_signal',
      });
      expect(links.length).toBe(1);
      expect(links[0].platformId).toBe('instagram');
    });

    it('skips anchor links', () => {
      const html = '<a href="#section">Anchor</a>';
      const links = extractLinks(html, {
        skipHosts,
        sourcePlatform: 'test',
        sourceSignal: 'test_signal',
      });
      expect(links.length).toBe(0);
    });

    it('skips javascript links', () => {
      const html = '<a href="javascript:void(0)">JS</a>';
      const links = extractLinks(html, {
        skipHosts,
        sourcePlatform: 'test',
        sourceSignal: 'test_signal',
      });
      expect(links.length).toBe(0);
    });

    it('skips mailto links', () => {
      const html = '<a href="mailto:test@example.com">Email</a>';
      const links = extractLinks(html, {
        skipHosts,
        sourcePlatform: 'test',
        sourceSignal: 'test_signal',
      });
      expect(links.length).toBe(0);
    });

    it('skips tel links', () => {
      const html = '<a href="tel:+1234567890">Phone</a>';
      const links = extractLinks(html, {
        skipHosts,
        sourcePlatform: 'test',
        sourceSignal: 'test_signal',
      });
      expect(links.length).toBe(0);
    });

    it('deduplicates links by canonical identity', () => {
      const html = `
        <a href="https://instagram.com/user">First</a>
        <a href="https://www.instagram.com/user">Second</a>
        <a href="https://instagram.com/user/">Third</a>
      `;
      const links = extractLinks(html, {
        skipHosts,
        sourcePlatform: 'test',
        sourceSignal: 'test_signal',
      });
      expect(links.length).toBe(1);
    });

    it('sets correct evidence', () => {
      const html = '<a href="https://instagram.com/user">Instagram</a>';
      const links = extractLinks(html, {
        skipHosts,
        sourcePlatform: 'linktree',
        sourceSignal: 'linktree_profile_link',
      });
      expect(links[0].evidence?.sources).toContain('linktree');
      expect(links[0].evidence?.signals).toContain('linktree_profile_link');
    });

    it('skips tracking URLs', () => {
      const html = `
        <a href="https://bit.ly/abc123">Shortened</a>
        <a href="https://t.co/xyz">Twitter Short</a>
      `;
      const links = extractLinks(html, {
        skipHosts,
        sourcePlatform: 'test',
        sourceSignal: 'test_signal',
      });
      expect(links.length).toBe(0);
    });
  });

  describe('isValidHandle', () => {
    it('accepts valid handles', () => {
      expect(isValidHandle('a')).toBe(true);
      expect(isValidHandle('ab')).toBe(true);
      expect(isValidHandle('user_name')).toBe(true);
      expect(isValidHandle('user.name')).toBe(true);
      expect(isValidHandle('user-name')).toBe(true);
      expect(isValidHandle('user123')).toBe(true);
    });

    it('rejects empty handles', () => {
      expect(isValidHandle('')).toBe(false);
    });

    it('rejects handles over 30 chars', () => {
      expect(isValidHandle('a'.repeat(31))).toBe(false);
    });

    it('accepts handles up to 30 chars', () => {
      expect(isValidHandle('a'.repeat(30))).toBe(true);
    });
  });

  describe('normalizeHandle', () => {
    it('lowercases', () => {
      expect(normalizeHandle('USERNAME')).toBe('username');
    });

    it('strips @ prefix', () => {
      expect(normalizeHandle('@user')).toBe('user');
    });

    it('trims whitespace', () => {
      expect(normalizeHandle('  user  ')).toBe('user');
    });

    it('combines all normalizations', () => {
      expect(normalizeHandle('  @UserName  ')).toBe('username');
    });
  });

  describe('validatePlatformUrl', () => {
    const config: StrategyConfig = {
      platformId: 'test',
      platformName: 'Test',
      validHosts: new Set(['test.com', 'www.test.com']),
      defaultTimeoutMs: 10000,
    };

    it('validates correct URLs', () => {
      const result = validatePlatformUrl('https://test.com/username', config);
      expect(result.valid).toBe(true);
      expect(result.handle).toBe('username');
    });

    it('rejects HTTP URLs', () => {
      const result = validatePlatformUrl('http://test.com/username', config);
      expect(result.valid).toBe(false);
    });

    it('rejects invalid hosts', () => {
      const result = validatePlatformUrl('https://other.com/username', config);
      expect(result.valid).toBe(false);
    });

    it('rejects URLs without handle', () => {
      const result = validatePlatformUrl('https://test.com/', config);
      expect(result.valid).toBe(false);
    });

    it('normalizes handle to lowercase', () => {
      const result = validatePlatformUrl('https://test.com/USERNAME', config);
      expect(result.handle).toBe('username');
    });

    it('strips @ prefix from handle', () => {
      const result = validatePlatformUrl('https://test.com/@username', config);
      expect(result.handle).toBe('username');
    });

    it('preserves the matched host instead of relying on set iteration order', () => {
      const result = validatePlatformUrl(
        'https://www.test.com/username',
        config
      );
      expect(result.normalized).toBe('https://test.com/username');
    });
  });

  describe('stripTrackingParams', () => {
    it('removes UTM parameters', () => {
      const url = 'https://example.com/page?utm_source=test&utm_medium=email';
      expect(stripTrackingParams(url)).toBe('https://example.com/page');
    });

    it('removes fbclid', () => {
      const url = 'https://example.com/page?fbclid=abc123';
      expect(stripTrackingParams(url)).toBe('https://example.com/page');
    });

    it('removes gclid', () => {
      const url = 'https://example.com/page?gclid=xyz789';
      expect(stripTrackingParams(url)).toBe('https://example.com/page');
    });

    it('preserves non-tracking parameters', () => {
      const url = 'https://example.com/page?id=123&utm_source=test';
      expect(stripTrackingParams(url)).toBe('https://example.com/page?id=123');
    });

    it('handles URLs without parameters', () => {
      const url = 'https://example.com/page';
      expect(stripTrackingParams(url)).toBe('https://example.com/page');
    });

    it('handles invalid URLs gracefully', () => {
      const url = 'not-a-url';
      expect(stripTrackingParams(url)).toBe('not-a-url');
    });
  });

  describe('fetchDocument', () => {
    beforeEach(() => {
      vi.stubGlobal('fetch', vi.fn());
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('returns HTML on success', async () => {
      const mockHtml = '<html><body>Test</body></html>';
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: () => Promise.resolve(mockHtml),
        url: 'https://example.com/page',
        headers: new Headers({ 'content-type': 'text/html' }),
      } as Response);

      const result = await fetchDocument('https://example.com/page');
      expect(result.html).toBe(mockHtml);
      expect(result.statusCode).toBe(200);
    });

    it('throws NOT_FOUND for 404', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      } as Response);

      try {
        await fetchDocument('https://example.com/page');
        expect.fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(ExtractionError);
        expect((e as ExtractionError).code).toBe('NOT_FOUND');
      }
    });

    it('throws RATE_LIMITED for 429', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
      } as Response);

      try {
        await fetchDocument('https://example.com/page');
      } catch (e) {
        expect((e as ExtractionError).code).toBe('RATE_LIMITED');
      }
    });

    it('throws EMPTY_RESPONSE for empty body', async () => {
      vi.useFakeTimers();
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve(''),
        url: 'https://example.com/page',
        headers: new Headers({ 'content-type': 'text/html' }),
      } as Response);

      const promise = fetchDocument('https://example.com/page');
      // Attach error handler immediately to prevent unhandled rejection
      const errorPromise = promise.catch(e => e);
      // Advance timers to skip retry delays
      await vi.runAllTimersAsync();

      const error = await errorPromise;
      expect(error).toBeInstanceOf(ExtractionError);
      expect((error as ExtractionError).code).toBe('EMPTY_RESPONSE');
      vi.useRealTimers();
    });

    it('retries on transient failures', async () => {
      vi.useFakeTimers();
      vi.mocked(fetch)
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: () => Promise.resolve('<html></html>'),
          url: 'https://example.com/page',
          headers: new Headers({ 'content-type': 'text/html' }),
        } as Response);

      const promise = fetchDocument('https://example.com/page', {
        maxRetries: 2,
      });
      // Advance timers to skip retry delays
      await vi.runAllTimersAsync();

      const result = await promise;
      expect(result.html).toBe('<html></html>');
      expect(fetch).toHaveBeenCalledTimes(2);
      vi.useRealTimers();
    });

    it('does not retry on 404', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      } as Response);

      await expect(fetchDocument('https://example.com/page')).rejects.toThrow();
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('does not retry on 429', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
      } as Response);

      await expect(fetchDocument('https://example.com/page')).rejects.toThrow();
      expect(fetch).toHaveBeenCalledTimes(1);
    });
  });
});
