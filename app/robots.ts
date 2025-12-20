import { MetadataRoute } from 'next';
import { APP_URL } from '@/constants/app';

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
    sitemap: `${APP_URL}/sitemap.xml`,
    host: APP_URL,
  };
}
