import { APP_ROUTES } from '@/constants/routes';

export const HOMEPAGE_YOUTUBE_MVP = {
  variantIdentity: 'youtube-artist-closed-loop-mvp-v1',
  seo: {
    title: 'Jovie | The release loop for YouTube artists',
    description:
      'Turn your regular YouTube uploads into thumbnails, release plans, smart links, and fans who opt in to hear from you again.',
  },
  hero: {
    kicker: 'For artists who upload every week',
    headline: 'Every upload, a release.',
    subhead:
      'Turn each YouTube upload into thumbnails, a release plan, a smart link, and a profile where fans can opt in to hear from you again.',
  },
  search: { placeholder: 'Search your artist name', action: 'Find me' },
  features: [
    {
      id: 'youtube-thumbnails',
      headline: 'Preview thumbnails that fit your channel.',
      body: 'Give your next YouTube upload a thumbnail worth opening. Preview options for your channel and review before anything is applied to YouTube.',
      href: APP_ROUTES.YOUTUBE_THUMBNAILS,
      action: 'Preview thumbnails',
    },
    {
      id: 'release-launch',
      headline: 'Launch the release behind the upload.',
      body: 'Bring your release plan, metadata, and listening links together. Release launch tools are available to enrolled artists.',
      href: APP_ROUTES.LAUNCH,
      action: 'Explore release planning',
    },
    {
      id: 'public-profile',
      headline: 'Give every viewer a place to return.',
      body: 'Keep your music and links on one public profile. Fans choose whether to receive updates, so the next upload starts with people you can reach again.',
      href: APP_ROUTES.ARTIST_PROFILES,
      action: 'Explore artist profiles',
    },
  ],
  surfaces: [
    {
      id: 'youtube-thumbnails',
      label: 'YouTube thumbnails',
      href: APP_ROUTES.YOUTUBE_THUMBNAILS,
    },
    {
      id: 'release-launch',
      label: 'Release planning',
      href: APP_ROUTES.LAUNCH,
    },
    { id: 'smart-links', label: 'Smart links', href: APP_ROUTES.SMART_LINKS },
    {
      id: 'public-profile',
      label: 'Public profile',
      href: APP_ROUTES.ARTIST_PROFILES,
    },
  ],
  proof: {
    headline: "BUILT BY PEOPLE WHO'VE CREATED FOR",
    // First-party career history, not customer adoption: data/aboutCopy.ts.
    music: 'We Are Loud, Justin Prime, Orjan Nilsen, and Lauryn Hill.',
    marketing: 'The NFL, the NBA All-Star Game, Google, and Netflix.',
    attribution: 'Tim White, artist and founder of Jovie',
  },
  pricing: {
    headline: 'Start with a free profile.',
    body: 'Build your presence first. Compare current plans and included features when you need more.',
  },
  close: { headline: 'Make your next upload a release.' },
} as const;
