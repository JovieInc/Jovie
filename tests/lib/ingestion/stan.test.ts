import { describe, expect, it } from 'vitest';
import {
  extractStan,
  extractStanHandle,
  isStanUrl,
  normalizeStanHandle,
  validateStanUrl,
} from '@/lib/ingestion/strategies/stan';

const getHost = (value: string): string => new URL(value).hostname;

describe('Stan strategy', () => {
  it('validates and normalizes Stan profile URLs', () => {
    expect(isStanUrl('https://stan.me/creator')).toBe(true);
    expect(validateStanUrl('https://www.stan.store/Creator')).toBe(
      'https://stan.me/creator'
    );
    expect(extractStanHandle('https://stanwith.me/@Artist')).toBe('artist');
    expect(normalizeStanHandle('  Artist  ')).toBe('artist');
  });

  it('returns null for invalid Stan URLs', () => {
    expect(validateStanUrl('http://stan.me/creator')).toBeNull();
    expect(isStanUrl('https://example.com/creator')).toBe(false);
  });

  it('extracts structured links and falls back to href scanning', () => {
    const html = `
      <html>
        <head>
          <script id="__NEXT_DATA__" type="application/json">
            ${JSON.stringify({
              props: {
                pageProps: {
                  profile: {
                    displayName: 'Creator',
                    avatarUrl: 'https://cdn.stan.me/avatar.png',
                    links: [
                      { url: 'https://instagram.com/creator', title: 'IG' },
                      {
                        url: 'https://stan.me/creator',
                        title: 'Home',
                        hidden: true,
                      },
                    ],
                  },
                },
              },
            })}
          </script>
          <meta property="og:title" content="Fallback Title" />
          <meta property="og:image" content="https://cdn.stan.me/og.png" />
        </head>
        <body>
          <a href="https://www.tiktok.com/@creator">TikTok</a>
          <a href="https://stan.me/creator">Profile</a>
        </body>
      </html>
    `;

    const result = extractStan(html);

    expect(result.displayName).toBe('Creator');
    expect(result.avatarUrl).toBe('https://cdn.stan.me/avatar.png');

    const hosts = result.links.map(link => getHost(link.url));
    expect(hosts).toContain('instagram.com');
    expect(hosts).toContain('www.tiktok.com');
    expect(hosts).not.toContain('stan.me');

    result.links.forEach(link => {
      expect(link.sourcePlatform).toBe('stan');
      expect(link.evidence?.sources).toContain('stan');
    });
  });
});
