/**
 * Unit tests for bot detection utilities.
 *
 * Tests the bot detection logic used in the profile view API route
 * to filter automated traffic from view counts.
 */

import { NextRequest } from 'next/server';
import { describe, expect, it, vi } from 'vitest';

// Mock Sentry
vi.mock('@sentry/nextjs', () => ({
  addBreadcrumb: vi.fn(),
}));

import {
  detectBot,
  getBotSafeHeaders,
  isSuspiciousRequest,
} from '@/lib/utils/bot-detection';

function createRequest(userAgent: string) {
  return new NextRequest('https://jov.ie/api/profile/view', {
    method: 'POST',
    headers: { 'user-agent': userAgent },
  });
}

describe('detectBot', () => {
  describe('Meta crawlers', () => {
    it.each([
      'facebookexternalhit/1.1',
      'Facebot',
      'facebookplatform/1.0',
      'Instagram 200.0',
      'WhatsApp/2.21',
    ])('detects "%s" as Meta bot', ua => {
      const result = detectBot(createRequest(ua));
      expect(result.isBot).toBe(true);
      expect(result.isMeta).toBe(true);
      expect(result.reason).toContain('Meta');
    });

    it('blocks Meta crawlers on sensitive endpoints', () => {
      const result = detectBot(
        createRequest('facebookexternalhit/1.1'),
        '/api/link/click'
      );
      expect(result.shouldBlock).toBe(true);
    });

    it('does not block Meta crawlers on non-sensitive endpoints', () => {
      const result = detectBot(
        createRequest('facebookexternalhit/1.1'),
        '/api/profile/view'
      );
      expect(result.shouldBlock).toBe(false);
    });
  });

  describe('Known crawlers', () => {
    it.each([
      'Googlebot/2.1',
      'bingbot/2.0',
      'DuckDuckBot/1.0',
      'Applebot/0.1',
      'Twitterbot/1.0',
      'LinkedInBot/1.0',
      'Pinterestbot/1.0',
      'Discordbot/2.0',
    ])('detects "%s" as known crawler', ua => {
      const result = detectBot(createRequest(ua));
      expect(result.isBot).toBe(true);
      expect(result.isMeta).toBe(false);
    });

    it('does not block known crawlers (anti-cloaking)', () => {
      const result = detectBot(
        createRequest('Googlebot/2.1'),
        '/api/profile/view'
      );
      expect(result.shouldBlock).toBe(false);
    });
  });

  describe('Legitimate browsers', () => {
    it.each([
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0)',
      'Mozilla/5.0 (Linux; Android 13)',
    ])('does not flag "%s" as bot', ua => {
      const result = detectBot(createRequest(ua));
      expect(result.isBot).toBe(false);
    });
  });

  it('handles empty user agent', () => {
    const result = detectBot(createRequest(''));
    expect(result.isBot).toBe(false);
    expect(result.userAgent).toBe('');
  });
});

describe('isSuspiciousRequest', () => {
  it('flags curl requests', () => {
    expect(isSuspiciousRequest(createRequest('curl/7.81.0'))).toBe(true);
  });

  it('flags wget requests', () => {
    expect(isSuspiciousRequest(createRequest('Wget/1.21'))).toBe(true);
  });

  it('flags python requests', () => {
    expect(isSuspiciousRequest(createRequest('python-requests/2.28'))).toBe(
      true
    );
  });

  it('does not flag browser-based tools (Mozilla prefix)', () => {
    expect(
      isSuspiciousRequest(createRequest('Mozilla/5.0 (compatible; bot/1.0)'))
    ).toBe(false);
  });

  it('does not flag legitimate browsers', () => {
    expect(
      isSuspiciousRequest(
        createRequest(
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        )
      )
    ).toBe(false);
  });

  it('flags empty user agent', () => {
    expect(isSuspiciousRequest(createRequest(''))).toBe(true);
  });
});

describe('getBotSafeHeaders', () => {
  it('includes base cache control headers for all requests', () => {
    const headers = getBotSafeHeaders(false);
    expect(headers['Cache-Control']).toBe(
      'no-cache, no-store, must-revalidate'
    );
    expect(headers['X-Robots-Tag']).toBeDefined();
  });

  it('adds Referrer-Policy for bot requests', () => {
    const headers = getBotSafeHeaders(true);
    expect(headers['Referrer-Policy']).toBe('no-referrer');
  });

  it('does not add Referrer-Policy for non-bot requests', () => {
    const headers = getBotSafeHeaders(false);
    expect(headers['Referrer-Policy']).toBeUndefined();
  });
});
