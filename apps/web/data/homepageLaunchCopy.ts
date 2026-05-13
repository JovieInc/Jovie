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
    title: 'Jovie | Release more music with less work',
    description:
      'Jovie gives artists one workspace for profiles, releases, fan capture, and release momentum.',
  },
  hero: {
    headline: 'Release more music with less work',
    subhead:
      'Plan the drop, route every fan, and keep the next release moving.',
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
  workspace: {
    kicker: 'Go live in 60 seconds',
    headline: 'One workspace\nFor every release',
    screenshotKey: 'shell-v1-releases-desktop',
    callouts: [
      {
        key: 'import',
        number: '01',
        title: 'Import the drop automatically',
        body: 'Jovie pulls artwork, credits, links, dates, and status into the workspace automatically.',
      },
      {
        key: 'publish',
        number: '02',
        title: 'Generate the launch plan',
        body: 'Turn the release into tasks for profile updates, DSP links, fan capture, and launch timing.',
      },
      {
        key: 'review',
        number: '03',
        title: 'Run the next action',
        body: 'Let Jovie handle the next action or assign it to your team with the context attached.',
      },
    ],
  },
  productStatement: {
    eyebrow: 'Meet Jovie',
    lead: 'A new kind of operating system',
    body: 'Built for music artists',
    cards: [
      {
        number: '01',
        title: 'Import the drop automatically',
        body: 'Jovie pulls artwork, credits, dates, links, and release status into one workspace automatically.',
      },
      {
        number: '02',
        title: 'Generate the launch plan',
        body: 'Turn each release into the plan, tasks, profile updates, fan paths, and launch timing it needs.',
      },
      {
        number: '03',
        title: 'Run the next action',
        body: 'Let Jovie run the next action or assign it to your team with the release context attached.',
      },
    ],
  },
  aiComposer: {
    headline: 'Ask once. Get the launch plan',
    body: 'Jovie turns a release into the fan path, launch tasks, and next actions your team can run.',
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
      label: 'Claim your profile',
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
      question: 'Are artist profiles free?',
      answer:
        'Yes. Artist profiles are free forever. Pro adds the release tools when you need presaves, notifications, deeper analytics, and more launch automation.',
    },
    {
      question: 'What does Jovie generate for a release?',
      answer:
        'Jovie turns release metadata into a working plan: profile updates, release pages, smart links, fan capture, launch tasks, and the next actions around the drop.',
    },
    {
      question: 'Can my team use the release plan?',
      answer:
        'Yes. Tasks can be assigned with the release context attached, so managers, collaborators, and artists work from the same source of truth.',
    },
    {
      question: 'Do I need to replace my current link in bio?',
      answer:
        'No. You can use Jovie as the primary artist profile or as a launch-specific fan path while you compare how it performs.',
    },
    {
      question: 'Can I review everything before publishing?',
      answer:
        'Yes. You can review and adjust the profile, release details, smart links, fan actions, and task plan before anything becomes part of your public launch path.',
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
