import { MetadataRoute } from 'next';
import { BASE_URL } from '@/constants/app';

// Single domain robots.txt configuration
// Everything is served from jov.ie:
// - Marketing pages, profiles: Allow indexing
// - /app/* dashboard routes: Block indexing
// - /api/* endpoints: Block indexing
// - meetjovie.com: 301 redirects to jov.ie (handled in middleware)
//
// Uses VERCEL_ENV to distinguish production from preview/staging at build time,
// making this route statically renderable (no runtime headers() dependency).

const isProduction = process.env.VERCEL_ENV === 'production';

export default function robots(): MetadataRoute.Robots {
  // jov.ie - allow marketing + profiles, block app/api routes
  if (isProduction) {
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
