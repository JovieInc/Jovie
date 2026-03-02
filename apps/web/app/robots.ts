import { MetadataRoute } from 'next';
import { BASE_URL } from '@/constants/app';
import { env } from '@/lib/env-server';

// Single domain robots.txt configuration
// Everything is served from jov.ie:
// - Marketing pages, profiles: Allow indexing
// - /app/* dashboard routes: Block indexing
// - /api/* endpoints: Block indexing
// - meetjovie.com: 301 redirects to jov.ie (handled in middleware)
//
// Uses VERCEL_ENV to distinguish production from preview/staging at build time,
// making this route statically renderable (no runtime headers() dependency).

const isProduction = env.VERCEL_ENV === 'production';

/** Paths blocked from indexing (app dashboard, APIs, tracking params). */
const DISALLOW_PATHS = [
  '/app/',
  '/api/',
  '/out/',
  '/*?ref=*',
  '/*&ref=*',
  '/*?utm_*',
  '/*&utm_*',
  '/*?fbclid=*',
  '/*&fbclid=*',
  '/*?gclid=*',
  '/*&gclid=*',
];

/**
 * AI crawlers to explicitly allow.
 * Listing them signals that Jovie welcomes AI search indexing.
 */
const AI_CRAWLERS = [
  'GPTBot',
  'ChatGPT-User',
  'Claude-Web',
  'Applebot-Extended',
  'PerplexityBot',
  'Google-Extended',
];

export default function robots(): MetadataRoute.Robots {
  // jov.ie - allow marketing + profiles, block app/api routes
  if (isProduction) {
    return {
      rules: [
        {
          userAgent: '*',
          allow: '/',
          disallow: DISALLOW_PATHS,
        },
        // Explicitly welcome AI crawlers for better AI search visibility
        ...AI_CRAWLERS.map(crawler => ({
          userAgent: crawler,
          allow: ['/', '/llms.txt'],
          disallow: DISALLOW_PATHS,
        })),
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
