/**
 * Bot Detection Tests
 * Tests for bot detection and anti-cloaking utilities
 */

import type { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import {
  checkMetaASN,
  checkRateLimit,
  createBotResponse,
  detectBot,
  getBotSafeHeaders,
  isSuspiciousRequest,
} from '@/lib/utils/bot-detection';

// Helper to create mock NextRequest
function createMockRequest(
  userAgent: string,
  options: { url?: string; headers?: Record<string, string> } = {}
): NextRequest {
  const headers = new Headers({
    'user-agent': userAgent,
    ...options.headers,
  });

  return {
    headers: {
      get: (name: string) => headers.get(name),
    },
    nextUrl: {
      pathname: options.url || '/api/test',
    },
    method: 'GET',
  } as unknown as NextRequest;
}

describe('Bot Detection', () => {
  describe('detectBot', () => {
    describe('Meta crawlers', () => {
      it('should detect Facebook external hit', () => {
        const request = createMockRequest(
          'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)'
        );

        const result = detectBot(request);

        expect(result.isBot).toBe(true);
        expect(result.isMeta).toBe(true);
        expect(result.reason).toContain('Meta');
      });

      it('should detect Facebot', () => {
        const request = createMockRequest('Facebot');

        const result = detectBot(request);

        expect(result.isBot).toBe(true);
        expect(result.isMeta).toBe(true);
      });

      it('should detect Instagram crawler', () => {
        const request = createMockRequest('Instagram 123.0');

        const result = detectBot(request);

        expect(result.isBot).toBe(true);
        expect(result.isMeta).toBe(true);
      });

      it('should detect WhatsApp crawler', () => {
        const request = createMockRequest('WhatsApp/2.0');

        const result = detectBot(request);

        expect(result.isBot).toBe(true);
        expect(result.isMeta).toBe(true);
      });
    });

    describe('Other crawlers', () => {
      it('should detect Googlebot', () => {
        const request = createMockRequest(
          'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'
        );

        const result = detectBot(request);

        expect(result.isBot).toBe(true);
        expect(result.isMeta).toBe(false);
        expect(result.reason).toContain('crawler');
      });

      it('should detect Bingbot', () => {
        const request = createMockRequest(
          'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)'
        );

        const result = detectBot(request);

        expect(result.isBot).toBe(true);
        expect(result.isMeta).toBe(false);
      });

      it('should detect Twitter bot', () => {
        const request = createMockRequest('Twitterbot/1.0');

        const result = detectBot(request);

        expect(result.isBot).toBe(true);
      });

      it('should detect Discord bot', () => {
        const request = createMockRequest('Discordbot/2.0');

        const result = detectBot(request);

        expect(result.isBot).toBe(true);
      });

      it('should detect LinkedIn bot', () => {
        const request = createMockRequest('LinkedInBot/1.0');

        const result = detectBot(request);

        expect(result.isBot).toBe(true);
      });
    });

    describe('Regular browsers', () => {
      it('should not flag Chrome browser', () => {
        const request = createMockRequest(
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        );

        const result = detectBot(request);

        expect(result.isBot).toBe(false);
        expect(result.isMeta).toBe(false);
      });

      it('should not flag Safari browser', () => {
        const request = createMockRequest(
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15'
        );

        const result = detectBot(request);

        expect(result.isBot).toBe(false);
      });

      it('should not flag Firefox browser', () => {
        const request = createMockRequest(
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0'
        );

        const result = detectBot(request);

        expect(result.isBot).toBe(false);
      });

      it('should not flag mobile browsers', () => {
        const request = createMockRequest(
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
        );

        const result = detectBot(request);

        expect(result.isBot).toBe(false);
      });
    });

    describe('Blocking behavior', () => {
      it('should block Meta crawlers on /api/link/ endpoints', () => {
        const request = createMockRequest('facebookexternalhit/1.1');

        const result = detectBot(request, '/api/link/abc123');

        expect(result.shouldBlock).toBe(true);
      });

      it('should block Meta crawlers on /api/sign/ endpoints', () => {
        const request = createMockRequest('facebookexternalhit/1.1');

        const result = detectBot(request, '/api/sign/generate');

        expect(result.shouldBlock).toBe(true);
      });

      it('should not block Meta crawlers on other endpoints', () => {
        const request = createMockRequest('facebookexternalhit/1.1');

        const result = detectBot(request, '/api/profile');

        expect(result.shouldBlock).toBe(false);
      });

      it('should never block non-Meta crawlers', () => {
        const request = createMockRequest('Googlebot/2.1');

        const result = detectBot(request, '/api/link/abc123');

        expect(result.shouldBlock).toBe(false);
      });
    });

    it('should include user agent in result', () => {
      const userAgent = 'Test User Agent';
      const request = createMockRequest(userAgent);

      const result = detectBot(request);

      expect(result.userAgent).toBe(userAgent);
    });

    it('should handle empty user agent', () => {
      const request = createMockRequest('');

      const result = detectBot(request);

      expect(result.isBot).toBe(false);
      expect(result.userAgent).toBe('');
    });
  });

  describe('checkMetaASN', () => {
    it('should return false (currently disabled)', async () => {
      const result = await checkMetaASN();

      expect(result).toBe(false);
    });
  });

  describe('checkRateLimit', () => {
    it('should return false (currently disabled)', async () => {
      const result = await checkRateLimit('192.168.1.1', '/api/test');

      expect(result).toBe(false);
    });
  });

  describe('createBotResponse', () => {
    it('should return 204 response by default', () => {
      const response = createBotResponse();

      expect(response.status).toBe(204);
    });

    it('should return 404 response when specified', () => {
      const response = createBotResponse(404);

      expect(response.status).toBe(404);
    });

    it('should include cache control headers', () => {
      const response = createBotResponse();

      expect(response.headers.get('Cache-Control')).toBe(
        'no-cache, no-store, must-revalidate'
      );
      expect(response.headers.get('Pragma')).toBe('no-cache');
      expect(response.headers.get('Expires')).toBe('0');
    });
  });

  describe('isSuspiciousRequest', () => {
    it('should flag curl requests', () => {
      const request = createMockRequest('curl/7.88.1');

      expect(isSuspiciousRequest(request)).toBe(true);
    });

    it('should flag wget requests', () => {
      const request = createMockRequest('Wget/1.21.4');

      expect(isSuspiciousRequest(request)).toBe(true);
    });

    it('should flag Python requests', () => {
      const request = createMockRequest('python-requests/2.31.0');

      expect(isSuspiciousRequest(request)).toBe(true);
    });

    it('should flag empty user agents', () => {
      const request = createMockRequest('');

      expect(isSuspiciousRequest(request)).toBe(true);
    });

    it('should not flag browser-based tools with Mozilla', () => {
      const request = createMockRequest(
        'Mozilla/5.0 (compatible; SomeBot/1.0)'
      );

      expect(isSuspiciousRequest(request)).toBe(false);
    });

    it('should not flag regular browsers', () => {
      const request = createMockRequest(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0'
      );

      expect(isSuspiciousRequest(request)).toBe(false);
    });
  });

  describe('getBotSafeHeaders', () => {
    it('should return base headers for non-bots', () => {
      const headers = getBotSafeHeaders(false);

      expect(headers['Cache-Control']).toBe(
        'no-cache, no-store, must-revalidate'
      );
      expect(headers['Pragma']).toBe('no-cache');
      expect(headers['Expires']).toBe('0');
      expect(headers['X-Robots-Tag']).toBe(
        'noindex, nofollow, nosnippet, noarchive'
      );
    });

    it('should add referrer policy for bots', () => {
      const headers = getBotSafeHeaders(true);

      expect(headers['Referrer-Policy']).toBe('no-referrer');
    });

    it('should not include referrer policy for non-bots', () => {
      const headers = getBotSafeHeaders(false);

      expect(headers['Referrer-Policy']).toBeUndefined();
    });
  });
});
