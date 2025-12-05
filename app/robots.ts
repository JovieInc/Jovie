import { MetadataRoute } from 'next';
import { APP_URL } from '@/constants/app';

export default function robots(): MetadataRoute.Robots {
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
