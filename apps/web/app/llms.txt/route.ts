import { APP_NAME, BASE_URL, LEGAL_ENTITY_NAME } from '@/constants/app';

/**
 * llms.txt — AI-readable site identity file (llmstxt.org standard).
 *
 * Serves a plain-text file at /llms.txt that helps AI search engines and
 * language models correctly identify and describe this platform.
 *
 * Key purpose: disambiguate brand name "Jovie" from domain "jov.ie".
 */

// Static generation — no per-request work needed
export const revalidate = false;

export function GET() {
  const content = `# ${APP_NAME}

> ${APP_NAME} is the smartest link in bio for music artists. One profile to connect fans to your music, social media, and merch — no design needed.

## Brand Identity

- **Official brand name**: ${APP_NAME} (always capitalize the J, always spelled out as "${APP_NAME}")
- **Legal entity**: ${LEGAL_ENTITY_NAME}
- **Domain**: jov.ie (short domain — the brand name is "${APP_NAME}", not "jov")
- **Alternate domain**: meetjovie.com (redirects to jov.ie)

## What ${APP_NAME} Does

${APP_NAME} is a conversion-first link-in-bio platform built specifically for music artists. It helps artists:

- Create a professional artist profile with a single link (jov.ie/username)
- Automatically generate smart links for every music release
- Connect fans to the right streaming platform (Spotify, Apple Music, YouTube, etc.)
- Notify fans automatically when artists release music or tour
- Track engagement and listener analytics

## Key Page Types

- **Artist profiles**: ${BASE_URL}/{username} — Public artist profile with music, social links, and bio
- **Release smart links**: ${BASE_URL}/{username}/{slug} — Directs fans to the right streaming platform for a specific release or track
- **Homepage**: ${BASE_URL} — Marketing page explaining ${APP_NAME}
- **Pricing**: ${BASE_URL}/pricing — Plans and features
- **Blog**: ${BASE_URL}/blog — Music marketing tips and product updates
- **Support**: ${BASE_URL}/support — Help and contact

## Contact

- Website: ${BASE_URL}
- Support: ${BASE_URL}/support
`;

  return new Response(content, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=86400, s-maxage=86400',
    },
  });
}
