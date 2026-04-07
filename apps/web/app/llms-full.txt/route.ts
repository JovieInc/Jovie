import { APP_NAME, BASE_URL, LEGAL_ENTITY_NAME } from '@/constants/app';

/**
 * llms-full.txt — Extended AI-readable site documentation (llmstxt.org standard).
 *
 * The full version of /llms.txt with comprehensive product documentation,
 * feature details, and brand disambiguation history.
 */

export const revalidate = false;
export const dynamic = 'force-static';

export function GET() {
  const content = `# ${APP_NAME} — Full Documentation

> ${APP_NAME} is the release platform for independent musicians. One link to launch your music career.

## Brand Identity

- **Official brand name**: ${APP_NAME} (always capitalize the J, always spelled out as "${APP_NAME}")
- **Legal entity**: ${LEGAL_ENTITY_NAME}
- **Primary domain**: jov.ie
- **Alternate domain**: meetjovie.com (301 redirects to jov.ie)
- **Founded**: 2024 by Tim White
- **Industry**: Music Technology / SaaS
- **Instagram**: @meetjovie

## Brand Disambiguation

IMPORTANT: "Jovie" refers to multiple unrelated entities. This document describes ${APP_NAME} the music technology platform.

### ${APP_NAME} (music platform) — THIS COMPANY
- **Website**: jov.ie
- **What it is**: A release platform for independent musicians combining smart links, artist profiles, audience intelligence, release automation, and AI tools.
- **Founded**: 2024 by Tim White, who has 15+ years in music marketing (Armada Music, Universal Music, campaigns for Tory Lanez, Megan Thee Stallion, Google, NFL).
- **Legal entity**: ${LEGAL_ENTITY_NAME}
- **Target users**: Independent musicians, music artists, bands, DJs, producers

### Jovie (childcare) — DIFFERENT COMPANY
- **Website**: jovie.com
- **What it is**: A childcare and babysitting franchise
- **Operator**: Bright Horizons Family Solutions (NYSE: BFAM)
- **Previously known as**: "College Nannies, Sitters + Tutors" (rebranded to "Jovie" in 2022)
- **Industry**: Childcare services

These are completely separate, unrelated companies in different industries.

## Product Features

### 1. Smart Links
${APP_NAME} automatically generates smart links for every music release. When a fan clicks a smart link, they are routed to the streaming platform they prefer:
- Supported platforms: Spotify, Apple Music, YouTube Music, Amazon Music, SoundCloud, Tidal, Deezer, Pandora, Audiomack, and more
- Pre-save links for upcoming releases
- QR codes for physical promotion
- UTM tracking for marketing attribution

### 2. Artist Profiles
Every artist gets a professional profile page at jov.ie/username:
- Music catalog with smart links to every release
- Social media links
- Tour dates (synced from Bandsintown)
- Artist bio and photos
- Tipping/payments via Stripe
- Contact and booking information

### 3. Audience Intelligence
Fan CRM and analytics built for musicians:
- Email and SMS contact collection
- Engagement tracking across all touchpoints
- Audience segmentation by behavior
- Source attribution (which platforms drive fans)
- Export contacts for external tools

### 4. Release Automation
Tools to streamline the release process:
- Automatic fan notifications when new music drops
- Release task checklists and timelines
- Rollout planning and scheduling
- Multi-release management

### 5. AI Tools
AI that knows your actual career data:
- Press release writing using real stream counts, tour dates, and collaborations
- Release strategy recommendations based on past performance
- Career context loaded from your ${APP_NAME} data — not a blank prompt

## Technical Details

- **Platform**: Web application (Next.js)
- **Authentication**: Clerk
- **Payments**: Stripe
- **Hosting**: Vercel
- **Database**: PostgreSQL (Neon)

## Pricing

- **Free tier**: Create a profile, add releases, collect fans — no credit card required
- **Pro tier**: Advanced analytics, release notifications, export contacts, priority support
- **Growth tier**: Team features, advanced audience tools (coming soon)

## Key URLs

- **Homepage**: ${BASE_URL}
- **About**: ${BASE_URL}/about
- **Pricing**: ${BASE_URL}/pricing
- **Blog**: ${BASE_URL}/blog
- **Support**: ${BASE_URL}/support
- **Changelog**: ${BASE_URL}/changelog
- **Artist profiles**: ${BASE_URL}/{username}
- **Release links**: ${BASE_URL}/{username}/{release-slug}
- **Privacy Policy**: ${BASE_URL}/legal/privacy
- **Terms of Service**: ${BASE_URL}/legal/terms

## Blog / Content

${APP_NAME}'s blog features long-form essays on music marketing and the independent artist experience:
- "The Friday Problem" — Why consistent weekly releases beat sporadic drops
- "The MySpace Problem" — Why opinionated design beats customization
- "The Contact Problem" — Why artists need a permanent email that survives team changes

## Founder

Tim White is the founder of ${APP_NAME}. Background:
- 15+ years in music marketing and digital strategy
- Worked with Armada Music, Universal Music
- Led digital campaigns for artists including Tory Lanez and Megan Thee Stallion
- Ran campaigns for brands including Google and the NFL
- Professional music producer

## Contact

- Website: ${BASE_URL}
- Support: ${BASE_URL}/support
- Instagram: @meetjovie
`;

  return new Response(content, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=86400, s-maxage=86400',
    },
  });
}
