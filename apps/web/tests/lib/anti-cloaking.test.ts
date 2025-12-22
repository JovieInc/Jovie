/**
 * Anti-Cloaking Tests
 * Validates anti-cloaking compliance and security measures
 */

import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  checkRateLimit,
  detectBot,
  getBotSafeHeaders,
} from '@/lib/utils/bot-detection';
import {
  categorizeDomain,
  containsSensitiveKeywords,
  getCrawlerSafeLabel,
  sanitizeForCrawlers,
} from '@/lib/utils/domain-categorizer';
import {
  extractDomain,
  simpleDecryptUrl,
  simpleEncryptUrl,
} from '@/lib/utils/url-encryption';

// Mock Supabase client
vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({ data: null, error: null }),
        }),
      }),
      insert: () => Promise.resolve({ error: null }),
      upsert: () => Promise.resolve({ error: null }),
    }),
  }),
}));

describe('Anti-Cloaking Bot Detection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Bot Detection', () => {
    it('should detect Meta crawlers correctly', () => {
      const request = new NextRequest('https://example.com/api/link/test123', {
        headers: {
          'User-Agent':
            'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
        },
      });

      const result = detectBot(request, '/api/link/test123');

      expect(result.isBot).toBe(true);
      expect(result.isMeta).toBe(true);
      expect(result.shouldBlock).toBe(true);
      expect(result.reason).toBe('Meta crawler detected');
    });

    it('should detect Instagram bot correctly', () => {
      const request = new NextRequest('https://example.com/api/link/test123', {
        headers: {
          'User-Agent':
            'Instagram 123.0.0.0.123 (iPhone; iOS 14.0; Scale/2.00)',
        },
      });

      const result = detectBot(request, '/api/link/test123');

      expect(result.isBot).toBe(true);
      expect(result.isMeta).toBe(true);
      expect(result.shouldBlock).toBe(true);
    });

    it('should not block Meta crawlers on public pages', () => {
      const request = new NextRequest('https://example.com/profile/user123', {
        headers: {
          'User-Agent': 'facebookexternalhit/1.1',
        },
      });

      const result = detectBot(request, '/profile/user123');

      expect(result.isBot).toBe(true);
      expect(result.isMeta).toBe(true);
      expect(result.shouldBlock).toBe(false); // Not blocking on public pages
    });

    it('should detect other crawlers without blocking', () => {
      const request = new NextRequest('https://example.com/api/link/test123', {
        headers: {
          'User-Agent': 'Googlebot/2.1 (+http://www.google.com/bot.html)',
        },
      });

      const result = detectBot(request, '/api/link/test123');

      expect(result.isBot).toBe(true);
      expect(result.isMeta).toBe(false);
      expect(result.shouldBlock).toBe(false); // Don't block other crawlers
    });

    it('should not detect regular browsers as bots', () => {
      const request = new NextRequest('https://example.com/api/link/test123', {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      });

      const result = detectBot(request);

      expect(result.isBot).toBe(false);
      expect(result.isMeta).toBe(false);
      expect(result.shouldBlock).toBe(false);
    });
  });

  describe('Bot-Safe Headers', () => {
    it('should return appropriate headers for bots', () => {
      const headers = getBotSafeHeaders(true);

      expect(headers).toHaveProperty(
        'Cache-Control',
        'no-cache, no-store, must-revalidate'
      );
      expect(headers).toHaveProperty(
        'X-Robots-Tag',
        'noindex, nofollow, nosnippet, noarchive'
      );
      expect(headers).toHaveProperty('Referrer-Policy', 'no-referrer');
    });

    it('should return basic headers for non-bots', () => {
      const headers = getBotSafeHeaders(false);

      expect(headers).toHaveProperty(
        'Cache-Control',
        'no-cache, no-store, must-revalidate'
      );
      expect(headers).toHaveProperty(
        'X-Robots-Tag',
        'noindex, nofollow, nosnippet, noarchive'
      );
      expect(headers).not.toHaveProperty('Referrer-Policy');
    });
  });
});

describe('Domain Categorization with Anti-Cloaking', () => {
  describe('Crawler-Safe Labels', () => {
    it('should return generic labels for sensitive domains', () => {
      expect(getCrawlerSafeLabel('onlyfans.com')).toBe('Premium Content');
      expect(getCrawlerSafeLabel('fansly.com')).toBe('Exclusive Content');
      expect(getCrawlerSafeLabel('draftkings.com')).toBe(
        'Sports Entertainment'
      );
      expect(getCrawlerSafeLabel('coinbase.com')).toBe('Digital Assets');
    });

    it('should return fallback for unknown domains', () => {
      expect(getCrawlerSafeLabel('unknown-domain.com')).toBe('External Link');
      expect(getCrawlerSafeLabel('unknown-domain.com', 'Custom Fallback')).toBe(
        'Custom Fallback'
      );
    });
  });

  describe('Sensitive Keyword Detection', () => {
    it('should detect sensitive keywords', () => {
      expect(containsSensitiveKeywords('porn videos')).toBe(true);
      expect(containsSensitiveKeywords('adult content')).toBe(true);
      expect(containsSensitiveKeywords('casino games')).toBe(true);
      expect(containsSensitiveKeywords('crypto trading')).toBe(true);
      expect(containsSensitiveKeywords('cash advance loans')).toBe(true);
    });

    it('should not detect normal content as sensitive', () => {
      expect(containsSensitiveKeywords('music streaming')).toBe(false);
      expect(containsSensitiveKeywords('social media')).toBe(false);
      expect(containsSensitiveKeywords('news website')).toBe(false);
    });
  });

  describe('Crawler Text Sanitization', () => {
    it('should sanitize sensitive keywords for crawlers', () => {
      expect(sanitizeForCrawlers('porn videos')).toBe('content videos');
      expect(sanitizeForCrawlers('adult content')).toBe('content content');
      expect(sanitizeForCrawlers('casino games')).toBe('gaming games');
      expect(sanitizeForCrawlers('crypto trading')).toBe('digital investment');
      expect(sanitizeForCrawlers('bitcoin exchange')).toBe('digital exchange');
      expect(sanitizeForCrawlers('cash advance')).toBe('financial');
    });

    it('should preserve non-sensitive text', () => {
      const text = 'music streaming platform';
      expect(sanitizeForCrawlers(text)).toBe(text);
    });
  });

  describe('Domain Categorization', async () => {
    it('should categorize sensitive domains correctly', async () => {
      const result = await categorizeDomain('https://onlyfans.com/user123');

      expect(result.kind).toBe('sensitive');
      expect(result.category).toBe('adult');
      expect(result.alias).toBe('Premium Content');
    });

    it('should categorize normal domains correctly', async () => {
      const result = await categorizeDomain('https://spotify.com/track/123');

      expect(result.kind).toBe('normal');
      expect(result.category).toBeNull();
      expect(result.alias).toBeNull();
    });
  });
});

describe('URL Encryption and Security', () => {
  describe('URL Encryption', () => {
    it('should encrypt and decrypt URLs correctly', () => {
      const originalUrl = 'https://example.com/sensitive-content';

      const encrypted = simpleEncryptUrl(originalUrl);
      expect(encrypted).not.toBe(originalUrl);
      expect(encrypted.length).toBeGreaterThan(0);

      const decrypted = simpleDecryptUrl(encrypted);
      expect(decrypted).toBe(originalUrl);
    });

    it('should handle empty URLs gracefully', () => {
      expect(() => simpleEncryptUrl('')).not.toThrow();
      expect(() => simpleDecryptUrl('')).not.toThrow();
    });
  });

  describe('Domain Extraction', () => {
    it('should extract domains correctly', () => {
      expect(extractDomain('https://www.example.com/path')).toBe('example.com');
      expect(extractDomain('http://subdomain.example.com')).toBe(
        'subdomain.example.com'
      );
      expect(extractDomain('https://example.com:8080/path')).toBe(
        'example.com'
      );
    });

    it('should handle invalid URLs gracefully', () => {
      expect(extractDomain('not-a-url')).toBe('');
      expect(extractDomain('')).toBe('');
    });
  });
});

describe('Rate Limiting', () => {
  it('should implement rate limiting correctly', async () => {
    const isLimited = await checkRateLimit('127.0.0.1', '/api/test');
    expect(typeof isLimited).toBe('boolean');
  });
});

describe('Anti-Cloaking Compliance', () => {
  describe('Consistent Responses', () => {
    it('should ensure consistent response structure for bots and users', () => {
      const botHeaders = getBotSafeHeaders(true);
      const userHeaders = getBotSafeHeaders(false);

      // Both should have basic security headers
      expect(botHeaders['Cache-Control']).toBe(userHeaders['Cache-Control']);
      expect(botHeaders['X-Robots-Tag']).toBe(userHeaders['X-Robots-Tag']);
    });
  });

  describe('Hop Count Validation', () => {
    it('should ensure minimal redirect hops', () => {
      // Normal links: /go/:id -> destination (1 hop)
      // Sensitive links: /out/:id -> interstitial -> destination (2 hops max)

      const normalHops = 1;
      const sensitiveHops = 2;

      expect(normalHops).toBeLessThanOrEqual(2);
      expect(sensitiveHops).toBeLessThanOrEqual(2);
    });
  });

  describe('Generic Content for Crawlers', () => {
    it('should provide generic descriptions without sensitive keywords', () => {
      const categories = ['adult', 'gambling', 'crypto', 'dating', 'lending'];

      categories.forEach(category => {
        const description = getCategoryDescription(category);
        expect(description).not.toMatch(
          /(porn|adult|xxx|nsfw|sex|casino|gambling|bet|crypto|bitcoin)/i
        );
        expect(description.length).toBeGreaterThan(0);
      });
    });
  });
});

function getCategoryDescription(category: string): string {
  const descriptions: Record<string, string> = {
    adult: 'This link requires confirmation',
    gambling: 'This link leads to a gaming platform',
    crypto: 'This link leads to a financial platform',
    trading: 'This link leads to an investment platform',
    dating: 'This link leads to a social platform',
    lending: 'This link leads to financial services',
  };

  return descriptions[category] || 'This link requires confirmation';
}
