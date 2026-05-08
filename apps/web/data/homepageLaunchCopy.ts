import { APP_ROUTES } from '@/constants/routes';

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
    title: 'Jovie | Drop more music, with less work.',
    description:
      'Jovie gives artists one workspace for profiles, releases, fan capture, and release momentum.',
  },
  hero: {
    eyebrow: 'Meet Jovie',
    headline: 'Drop more music, with less work.',
    subhead: 'Release music faster and grow your audience effortlessly.',
    primaryCta: {
      label: 'Start Free Trial',
      href: APP_ROUTES.SIGNUP,
    },
    secondaryCta: {
      label: 'Explore Profiles',
      href: APP_ROUTES.ARTIST_PROFILES,
    },
  },
  fallbackCta: {
    label: 'Start Free',
    href: APP_ROUTES.SIGNUP,
    support: 'Free profile. 14-day Pro trial.',
  },
  productProof: {
    eyebrow: 'Release Command Center',
    headline: 'Plan the release around the page fans will actually see.',
    body: 'Tasks, presaves, copy, fan actions, and profile updates stay attached to the same product surface.',
    points: [
      'A working dashboard for the artist team.',
      'A polished public view for every fan touchpoint.',
    ],
  },
  workflow: {
    eyebrow: 'Release Workflow',
    headlineMuted: 'Connect, preview, and publish',
    headline: 'from one release workspace.',
    body: 'Connect your artist source, review the page, and publish the next release without rebuilding the campaign.',
    steps: [
      {
        title: 'Connect',
        body: 'Bring in your artist profile, release details, and links.',
        screenshotKey: 'public-profile-desktop',
      },
      {
        title: 'Preview',
        body: 'See the profile, release page, fan actions, and routing together.',
        screenshotKey: 'release-presave-mobile',
      },
      {
        title: 'Publish',
        body: 'Share one Jovie presence that keeps updating after launch.',
        screenshotKey: 'artist-spec-tracked-links-desktop',
      },
    ],
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
  faq: [
    {
      question: 'What does Jovie create for an artist?',
      answer:
        'Jovie creates a public artist profile, release pages, smart links, fan capture, and a workspace for the tasks around each drop.',
    },
    {
      question: 'Do I need to replace my existing link in bio?',
      answer:
        'No. You can use Jovie as the primary link or as a launch-specific page while you compare how it performs.',
    },
    {
      question: 'Can I edit the profile before it goes live?',
      answer:
        'Yes. The signup flow captures your intent, then you can review and adjust the profile, release details, links, and calls to action.',
    },
    {
      question: 'What happens after I publish?',
      answer:
        'Jovie keeps the release context, fan actions, and analytics together so the next launch starts with what already worked.',
    },
    {
      question: 'How much does it cost?',
      answer:
        'You can start with a free artist profile. Pro adds release notifications, presaves, fan CRM, extended analytics, and priority support.',
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
      ctaAnchor: '#release-workflow',
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
