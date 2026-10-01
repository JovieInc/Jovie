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
//
// Fail-safe default: serve allow-rules UNLESS an affirmative non-prod signal is
// present. A missing or empty VERCEL_ENV must never block production crawlers —
// the original `=== 'production'` check was fail-dangerous (undefined → Disallow: /).
const isPreview =
  env.VERCEL_ENV === 'preview' || env.VERCEL_ENV === 'development';
const isProduction = !isPreview;

/**
 * Paths blocked from indexing.
 *
 * Keep these to unambiguous namespaces only. Top-level prefixes like `/demo`
 * or `/ui` can collide with public profile usernames because robots disallow
 * matching is prefix-based.
 */
const DISALLOW_PATHS = [
  '/app/',
  '/api/',
  '/out/',
  // Private investor surfaces (and the retired public /investors, /pitch).
  // `$` anchors the bare path so a profile handle like /pitchfork stays
  // crawlable; the trailing-slash form covers every child path.
  '/investor-portal$',
  '/investor-portal/',
  '/investors$',
  '/investors/',
  '/pitch$',
  '/pitch/',
  '/Jovie-Pitch-Deck.pdf$',
  '/engineering/preview/',
  '/renders/',
  '/*?ref=*',
  '/*&ref=*',
  '/*?utm_*',
  '/*&utm_*',
  '/*?fbclid=*',
  '/*&fbclid=*',
  '/*?gclid=*',
  '/*&gclid=*',
];

// Preserve explicit search, user-fetch, training/control, and legacy grants.
// Their distinct purposes are recorded by the certification/guardrail owner.
// Keep this route's literal grants visible to the static SEO ratchet.
const AI_CRAWLERS = [
  'OAI-SearchBot',
  'Claude-SearchBot',
  'PerplexityBot',
  'GPTBot',
  'ClaudeBot',
  'Google-Extended',
  'Applebot-Extended',
  'ChatGPT-User',
  'Claude-Web',
  'Anthropic-AI',
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
        // Apply the declared AI crawler policy by purpose
        // But block investor and internal utility routes from ALL crawlers
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
