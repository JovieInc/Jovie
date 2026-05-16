import { APP_ROUTES } from '@/constants/routes';
import { FEATURE_FLAGS } from '@/lib/flags/marketing-static';

// Prelaunch front-door label. Server-side waitlist gate handles the
// post-/signup routing; this controls only the marketing copy.
export const FRONT_DOOR_CTA_LABEL = FEATURE_FLAGS.WAITLIST_ENABLED
  ? 'Request access'
  : 'Claim your free profile';
const FALLBACK_CTA_SUPPORT = FEATURE_FLAGS.WAITLIST_ENABLED
  ? 'Limited prelaunch access. We will email when you are in.'
  : 'Free forever. No credit card.';

export interface HomepageHeroCarouselSlide {
  readonly id: string;
  readonly label: string;
  readonly headline: string;
  readonly description: string;
  readonly desktopScreenshotKey: string;
  readonly mobileScreenshotKey: string;
  readonly ctaAnchor?: string;
}

export const HOMEPAGE_LAUNCH_COPY = {
  seo: {
    title: 'Jovie | Monetize your music catalog with AI',
    description:
      'Jovie is the AI artist workspace that surfaces opportunities in your catalog — fan paths, presaves, pitches — and helps you ship the next one.',
  },
  hero: {
    headline: 'Monetize your music catalog with AI',
    subhead:
      'Connect your catalog. Jovie turns each release into the next fan path, presave, or playlist pitch.',
    primaryCta: {
      label: FRONT_DOOR_CTA_LABEL,
      href: APP_ROUTES.SIGNUP,
    },
    secondaryCta: {
      label: 'See a live profile',
      href: APP_ROUTES.ARTIST_PROFILES,
    },
  },
  fallbackCta: {
    label: FRONT_DOOR_CTA_LABEL,
    href: APP_ROUTES.SIGNUP,
    support: FALLBACK_CTA_SUPPORT,
  },
  workspace: {
    kicker: 'What Jovie finds.',
    headline: 'All your music.\nWorking while you sleep.',
    screenshotKey: 'shell-v1-releases-desktop',
    callouts: [
      {
        key: 'import',
        number: '01',
        title: 'Your catalog, in one place',
        body: 'Releases, assets, links, dates, fans, and stream history come together automatically.',
      },
      {
        key: 'publish',
        number: '02',
        title: 'Opportunities surfaced',
        body: 'Jovie scans the whole catalog for underexposed releases, missing fan paths, and presave gaps.',
      },
      {
        key: 'review',
        number: '03',
        title: 'Launch the next one',
        body: 'Generate the presave page, fan path, or pitch and send it live to your audience.',
      },
    ],
  },
  productStatement: {
    eyebrow: '',
    lead: 'Meet Jovie',
    body: 'Your always-on AI artist manager.',
    cards: [
      {
        number: '',
        title: 'Underexposed releases.',
        body: 'Songs gaining momentum that have no presave page or fan capture set up.',
      },
      {
        number: '',
        title: 'Missing fan paths.',
        body: 'Streams that arrive without a way for listeners to follow, subscribe, or save the next drop.',
      },
      {
        number: '',
        title: 'Playlist openings.',
        body: 'Editorial and curator playlists adding artists with your sound.',
      },
    ],
  },
  aiComposer: {
    headline: 'Ask once. Surface the next opportunity.',
    body: 'Jovie turns a release into the fan path, presave, or pitch your team can ship.',
  },
  intentBand: {
    eyebrow: 'Ask Jovie',
    headline: 'Turn the next release into a working plan.',
    body: 'Use the prompt when you want Jovie to draft the release plan, profile updates, and fan touchpoints after you have seen the product surface.',
  },
  profileProof: {
    headline: 'Artist profiles built to convert.',
    body: 'A Jovie profile is not another link list. It routes fans to the right action and keeps the signal for the next release.',
    items: [
      'Listen links stay synced across DSPs.',
      'Presaves, shows, merch, and contact live in the same presence.',
      'Fan capture builds a list you can use again.',
      'Analytics show what moved before the next Friday.',
    ],
  },
  artistProfiles: {
    headline: 'Artist profiles',
    headlineAccent: 'Built to convert',
    subhead: 'Streams. Fans. Shows. Payments. Drops.',
    cards: [
      {
        id: 'get-paid',
        title: 'Get Paid',
        screenshotScenarioId: 'tim-white-profile-pay-mobile',
        glow: 'cyan',
      },
      {
        id: 'drive-streams',
        title: 'Drive Streams',
        screenshotScenarioId: 'tim-white-profile-listen-mobile',
        glow: 'blue',
      },
      {
        id: 'capture-fans',
        title: 'Capture Fans',
        screenshotScenarioId: 'tim-white-profile-subscribe-mobile',
        glow: 'violet',
      },
      {
        id: 'sell-out',
        title: 'Sell Out',
        screenshotScenarioId: 'tim-white-profile-tour-mobile',
        glow: 'magenta',
      },
      {
        id: 'drop-music',
        title: 'Drop Music',
        screenshotScenarioId: 'tim-white-profile-presave-mobile',
        glow: 'aurora',
      },
    ],
    primaryCta: {
      label: FRONT_DOOR_CTA_LABEL,
      href: APP_ROUTES.SIGNUP,
    },
    secondaryCta: {
      label: 'View example',
      href: APP_ROUTES.ARTIST_PROFILES,
    },
  },
  specWall: {
    headline: 'Answers for every launch objection',
    body: 'The release details that usually become another tool, already built into the system.',
    items: [
      {
        title: 'Presaves',
        body: 'Countdowns, pre-save CTAs, and release-day redirects from the same link.',
        accent: 'cyan',
      },
      {
        title: 'Bot protection',
        body: 'Filter bots, team clicks, and tests before they pollute launch signal.',
        accent: 'blue',
      },
      {
        title: 'AI art direction',
        body: 'Generate cover-art directions from the release brief when the drop needs a look.',
        accent: 'cyan',
      },
      {
        title: 'Fast catalogs',
        body: 'Tables, search, keyboard flow, and bulk actions for serious release catalogs.',
        accent: 'blue',
      },
      {
        title: 'Custom routing',
        body: 'UTMs, QR codes, geo routing, and profile modes without rebuilding links.',
        accent: 'cyan',
      },
      {
        title: 'Fan notifications',
        body: 'Fans opt in once. Jovie brings them back for the next song or show.',
        accent: 'blue',
      },
    ],
  },
  faq: [
    {
      question: 'What does Jovie actually do?',
      answer:
        'Connect your music. Jovie watches your catalog, fans, and stream movement, then surfaces specific opportunities. A release worth a presave. A playlist that fits your sound. A fan moment to capture.',
    },
    {
      question: 'Where does my catalog data come from?',
      answer:
        'Spotify, Apple Music, and your DSPs. Connect once. Jovie keeps every release, asset, and fan path in one place.',
    },
    {
      question: 'Does Jovie post or pitch on my behalf?',
      answer:
        'Only when you say so. Jovie surfaces and drafts. You decide what goes live.',
    },
    {
      question: 'How does Jovie know what is worth surfacing?',
      answer:
        'It watches every track in your catalog every day. Streams, fan moments, playlist movement, and editorial activity all feed the model.',
    },
    {
      question: 'Who is Jovie for?',
      answer:
        'Artists with a catalog already out and the team around them. Built for the work between drops, not just launch week.',
    },
  ],
} as const;

export const HOMEPAGE_HERO_CAROUSEL_SLIDES: readonly HomepageHeroCarouselSlide[] =
  [
    {
      id: 'profile-presence',
      label: 'Artist Profile',
      headline: 'A profile that looks ready before fans arrive.',
      description:
        'Show the full artist presence on desktop and the mobile view fans actually open.',
      desktopScreenshotKey: 'public-profile-desktop',
      mobileScreenshotKey: 'public-profile-mobile',
      ctaAnchor: '#artist-profiles',
    },
    {
      id: 'release-command',
      label: 'Release Workspace',
      headline: 'The launch plan stays beside the fan experience.',
      description:
        'Tasks, presaves, copy, and release timing stay in one place instead of another scattered checklist.',
      desktopScreenshotKey: 'release-tasks-desktop',
      mobileScreenshotKey: 'release-presave-mobile',
      ctaAnchor: '#release-workspace',
    },
    {
      id: 'fan-routing',
      label: 'Fan Routing',
      headline: 'Every click can become a cleaner next move.',
      description:
        'Track links, capture intent, and route each fan to the action that matters for this release.',
      desktopScreenshotKey: 'artist-spec-tracked-links-desktop',
      mobileScreenshotKey: 'tim-white-profile-subscribe-mobile',
      ctaAnchor: '#artist-profiles',
    },
    {
      id: 'release-signal',
      label: 'Audience Signal',
      headline: 'See what moved before the next Friday.',
      description:
        'Geography, traffic quality, and fan action stay connected to the profile and release plan.',
      desktopScreenshotKey: 'artist-spec-geo-insights-desktop',
      mobileScreenshotKey: 'tim-white-profile-listen-mobile',
      ctaAnchor: '#pricing',
    },
  ] as const;
