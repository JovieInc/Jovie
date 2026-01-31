import { MetadataRoute } from 'next';
import { headers } from 'next/headers';
import { BASE_URL } from '@/constants/app';
import { HOSTNAME } from '@/constants/domains';

// Single domain robots.txt configuration
// Everything is served from jov.ie:
// - Marketing pages, profiles: Allow indexing
// - /app/* dashboard routes: Block indexing
// - /api/* endpoints: Block indexing
// - meetjovie.com: 301 redirects to jov.ie (handled in middleware)

export default async function robots(): Promise<MetadataRoute.Robots> {
  const headersList = await headers();
  const host = headersList.get('host') || '';

  const isMainDomain = host === HOSTNAME || host === `www.${HOSTNAME}`;

  // jov.ie - allow marketing + profiles, block app/api routes
  if (isMainDomain) {
    return {
      rules: [
        {
          userAgent: '*',
          allow: '/',
          disallow: ['/app/', '/api/', '/out/'],
        },
      ],
      sitemap: `${BASE_URL}/sitemap.xml`,
      host: BASE_URL,
    };
  }

  // Preview/staging environments - block indexing
  return {
    rules: [
      {
        userAgent: '*',
        disallow: '/',
      },
    ],
  };
}
