import { MetadataRoute } from 'next';
import { PRIMARY_URL } from '@/constants/domains';

/**
 * Single-domain robots.txt configuration for jov.ie
 * All traffic served from one domain - no multi-domain logic needed
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/api/',
          '/app/',
          '/admin/',
          '/_next/',
          '/private/',
          '/out/',
        ],
      },
    ],
    sitemap: `${PRIMARY_URL}/sitemap.xml`,
    host: PRIMARY_URL,
  };
}
