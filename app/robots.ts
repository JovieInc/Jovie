import { MetadataRoute } from 'next';
import { APP_URL } from '@/constants/app';
import { ensureSentry } from '@/lib/sentry/ensure';

export default async function robots(): Promise<MetadataRoute.Robots> {
  await ensureSentry();
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/legal/privacy', '/legal/terms'],
        disallow: [
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
        allow: ['/', '/legal/privacy', '/legal/terms'],
        disallow: [
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
        allow: ['/', '/legal/privacy', '/legal/terms'],
        disallow: [
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
        allow: ['/', '/legal/privacy', '/legal/terms'],
        disallow: [
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
    sitemap: `${APP_URL}/sitemap.xml`,
    host: APP_URL,
  };
}
