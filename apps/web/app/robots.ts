import { MetadataRoute } from 'next';
import { MARKETING_URL } from '@/constants/app';

// Multi-domain robots.txt configuration
// This serves from the marketing domain (meetjovie.com)
// Profile domain (jov.ie) will have its own robots.txt if needed

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/blog', '/blog/', '/legal/privacy', '/legal/terms'],
        disallow: [
          '/investors',
          '/api/',
          '/dashboard/',
          '/admin/',
          '/_next/',
          '/private/',
          '/auth/',
          '/out/',
          '/*.json',
          '/*.xml',
        ],
        crawlDelay: 1,
      },
      {
        userAgent: 'Googlebot',
        allow: ['/', '/blog', '/blog/', '/legal/privacy', '/legal/terms'],
        disallow: [
          '/investors',
          '/api/',
          '/dashboard/',
          '/admin/',
          '/_next/',
          '/private/',
          '/auth/',
          '/out/',
          '/*.json',
          '/*.xml',
        ],
        crawlDelay: 1,
      },
      {
        userAgent: 'Bingbot',
        allow: ['/', '/blog', '/blog/', '/legal/privacy', '/legal/terms'],
        disallow: [
          '/investors',
          '/api/',
          '/dashboard/',
          '/admin/',
          '/_next/',
          '/private/',
          '/auth/',
          '/out/',
          '/*.json',
          '/*.xml',
        ],
        crawlDelay: 1,
      },
      {
        userAgent: 'Slurp',
        allow: ['/', '/blog', '/blog/', '/legal/privacy', '/legal/terms'],
        disallow: [
          '/investors',
          '/api/',
          '/dashboard/',
          '/admin/',
          '/_next/',
          '/private/',
          '/auth/',
          '/out/',
          '/*.json',
          '/*.xml',
        ],
        crawlDelay: 1,
      },
    ],
    sitemap: `${MARKETING_URL}/sitemap.xml`,
    host: MARKETING_URL,
  };
}
