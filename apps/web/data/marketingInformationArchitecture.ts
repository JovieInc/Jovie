import { APP_ROUTES } from '@/constants/routes';

export type MarketingInformationPageStatus = 'live' | 'early-access';

export interface MarketingInformationPageSection {
  readonly heading: string;
  readonly body: string;
  readonly links?: readonly { readonly href: string; readonly label: string }[];
}

export interface MarketingInformationPageDefinition {
  readonly path: string;
  readonly title: string;
  readonly description: string;
  readonly eyebrow: string;
  readonly headline: string;
  readonly status: MarketingInformationPageStatus;
  readonly sections: readonly MarketingInformationPageSection[];
}

const productPages = [
  {
    path: APP_ROUTES.PRODUCT,
    title: 'Product',
    description:
      'One connected system for identity, discovery, audience context, and direct relationships.',
    eyebrow: 'Jovie product',
    headline: 'One system, many doors.',
    status: 'live',
    sections: [
      {
        heading: 'Start with the part you need.',
        body: 'Profiles, discoverability, audience intelligence, and relationships share one identity instead of becoming four disconnected tools.',
        links: [
          { href: APP_ROUTES.PRODUCT_PROFILES, label: 'Profiles' },
          {
            href: APP_ROUTES.PRODUCT_DISCOVERABILITY,
            label: 'Discoverability',
          },
          {
            href: APP_ROUTES.PRODUCT_AUDIENCE_INTELLIGENCE,
            label: 'Audience Intelligence',
          },
          { href: APP_ROUTES.PRODUCT_RELATIONSHIPS, label: 'Relationships' },
        ],
      },
      {
        heading: 'The public presence and the workspace stay connected.',
        body: 'A release, link, audience action, or profile update remains attached to the same artist identity. You can see the system in the live Artist Profiles experience.',
        links: [
          {
            href: APP_ROUTES.ARTIST_PROFILES,
            label: 'Explore Artist Profiles',
          },
        ],
      },
    ],
  },
  {
    path: APP_ROUTES.PRODUCT_PROFILES,
    title: 'Profiles',
    description:
      'A canonical public identity for releases, links, events, contact, and fan actions.',
    eyebrow: 'Product / Profiles',
    headline: 'Your work, in one canonical place.',
    status: 'live',
    sections: [
      {
        heading: 'More than a link list.',
        body: 'Put the current release, listening destinations, shows, contact, support, and fan capture inside one music-native profile.',
      },
      {
        heading: 'Built from exact product states.',
        body: 'The Artist Profiles page shows real mobile and desktop captures, including releases, listening, subscription, touring, and direct support.',
        links: [
          { href: APP_ROUTES.ARTIST_PROFILES, label: 'See Artist Profiles' },
        ],
      },
    ],
  },
  {
    path: APP_ROUTES.PRODUCT_DISCOVERABILITY,
    title: 'Discoverability',
    description:
      'Make a public identity legible to people, search engines, and AI systems.',
    eyebrow: 'Product / Discoverability',
    headline: 'Be found. Be understood.',
    status: 'live',
    sections: [
      {
        heading: 'One source for the story people find.',
        body: 'A public Jovie profile connects identity, releases, links, and structured context at one canonical URL.',
      },
      {
        heading: 'Keep the next action close.',
        body: 'Discovery is useful when a listener can immediately listen, subscribe, find a show, support the artist, or make contact.',
      },
    ],
  },
  {
    path: APP_ROUTES.PRODUCT_AUDIENCE_INTELLIGENCE,
    title: 'Audience Intelligence',
    description:
      'Understand where attention comes from and which fan actions follow.',
    eyebrow: 'Product / Audience Intelligence',
    headline: 'Know who cares, and why.',
    status: 'early-access',
    sections: [
      {
        heading: 'Context, not vanity metrics.',
        body: 'Connect profile visits, tracked destinations, geography, and fan capture to the release or page that created the moment.',
      },
      {
        heading: 'Availability',
        body: 'Audience views and tracked-link evidence exist in the product today. Coverage varies by connected source, so this page does not promise a complete identity for every visitor.',
      },
    ],
  },
  {
    path: APP_ROUTES.PRODUCT_RELATIONSHIPS,
    title: 'Relationships',
    description: 'Turn attention into direct fan and business relationships.',
    eyebrow: 'Product / Relationships',
    headline: 'Keep the relationship after the click.',
    status: 'live',
    sections: [
      {
        heading: 'Give every visitor a useful next step.',
        body: 'Profile modes support listening, release alerts, nearby shows, direct support, and contact without forcing every visitor through the same funnel.',
      },
      {
        heading: 'Build direct reach with consent.',
        body: 'Fan capture creates an opt-in connection an artist can use for future releases. Jovie does not claim permission or send on an artist’s behalf without their action.',
      },
    ],
  },
] as const satisfies readonly MarketingInformationPageDefinition[];

const personaPages = [
  {
    path: APP_ROUTES.FOR,
    title: 'Jovie for your work',
    description:
      'See how one connected public identity serves artists, founders, creators, and authors.',
    eyebrow: 'For',
    headline: 'Different work. One connected story.',
    status: 'early-access',
    sections: [
      {
        heading: 'Choose your starting point.',
        body: 'The artist workflow is the deepest live product path today. Founder, creator, and author pages describe the truthful shared identity layer and mark broader workflow coverage as early access.',
        links: [
          { href: APP_ROUTES.FOR_ARTISTS, label: 'Artists' },
          { href: APP_ROUTES.FOR_FOUNDERS, label: 'Founders' },
          { href: APP_ROUTES.FOR_CREATORS, label: 'Creators' },
          { href: APP_ROUTES.FOR_AUTHORS, label: 'Authors' },
        ],
      },
    ],
  },
  {
    path: APP_ROUTES.FOR_ARTISTS,
    title: 'Jovie for Artists',
    description:
      'Connect profiles, catalog, press, links, discovery, audience signals, and direct fan relationships.',
    eyebrow: 'For artists',
    headline: 'Your music should add up to one identity.',
    status: 'live',
    sections: [
      {
        heading: 'Replace the fragmented stack with a connected path.',
        body: 'Bring the public profile, release pages, listening links, fan capture, shows, support, and contact into one artist presence.',
      },
      {
        heading: 'See the product, not a promise.',
        body: 'Open the proof-led Artist Profiles page for exact mobile and desktop product captures.',
        links: [
          {
            href: APP_ROUTES.ARTIST_PROFILES,
            label: 'Explore Artist Profiles',
          },
        ],
      },
    ],
  },
  {
    path: APP_ROUTES.FOR_FOUNDERS,
    title: 'Jovie for Founders',
    description:
      'Connect a company, products, writing, interviews, projects, and audiences around one public story.',
    eyebrow: 'For founders',
    headline: 'Let the work compound into one public story.',
    status: 'early-access',
    sections: [
      {
        heading: 'What works now.',
        body: 'A canonical Jovie identity can organize public links, projects, writing, contact, and audience actions around one durable URL.',
      },
      {
        heading: 'What is not claimed yet.',
        body: 'Jovie does not yet promise automated company-history synthesis or autonomous publication for founders. Those workflows remain outside this page until exact product proof exists.',
      },
    ],
  },
  {
    path: APP_ROUTES.FOR_CREATORS,
    title: 'Jovie for Creators',
    description:
      'Connect distributed content, audience context, destinations, and direct reach.',
    eyebrow: 'For creators',
    headline: 'Give distributed content one durable home.',
    status: 'early-access',
    sections: [
      {
        heading: 'Connect the work and the destination.',
        body: 'Use one identity to organize content, links, contact, and opt-in audience paths instead of rebuilding context on every platform.',
      },
      {
        heading: 'Tools are live where the proof is live.',
        body: 'The YouTube thumbnail tool is available now. Broader creator optimization remains early access and is not represented here as autonomous.',
        links: [
          {
            href: APP_ROUTES.YOUTUBE_THUMBNAILS,
            label: 'Try YouTube Thumbnails',
          },
        ],
      },
    ],
  },
  {
    path: APP_ROUTES.FOR_AUTHORS,
    title: 'Jovie for Authors',
    description:
      'Connect books, ideas, interviews, media, events, topics, and reader relationships.',
    eyebrow: 'For authors',
    headline: 'Keep the ideas connected after launch day.',
    status: 'early-access',
    sections: [
      {
        heading: 'One identity for books and the work around them.',
        body: 'Organize writing, interviews, media, events, contact, and subscription paths around a canonical public identity.',
      },
      {
        heading: 'Current boundary.',
        body: 'The shared profile and publishing primitives are live. Book-specific ingestion, topic modeling, and reader automation are not presented as shipped capabilities.',
      },
    ],
  },
] as const satisfies readonly MarketingInformationPageDefinition[];

export const MARKETING_INFORMATION_PAGES = [
  ...productPages,
  ...personaPages,
  {
    path: APP_ROUTES.HOW_IT_WORKS,
    title: 'How Jovie Works',
    description:
      'Connect an identity, publish the right public view, and learn from the actions that follow.',
    eyebrow: 'How it works',
    headline: 'Connect once. Keep the whole story working together.',
    status: 'live',
    sections: [
      {
        heading: '1. Start with your identity.',
        body: 'Find or claim the public profile that represents your work.',
      },
      {
        heading: '2. Connect the useful evidence.',
        body: 'Add releases, destinations, shows, contact, support, and fan-capture paths that exist for your work.',
      },
      {
        heading: '3. Publish one clear next step.',
        body: 'Share one canonical profile while the page adapts its emphasis to the release or visitor moment.',
      },
      {
        heading: '4. Learn from the response.',
        body: 'Use available audience and link context to improve the next release, page, or direct relationship.',
      },
    ],
  },
  {
    path: APP_ROUTES.TOOLS,
    title: 'Jovie Tools',
    description:
      'Live acquisition tools that create a useful result before signup.',
    eyebrow: 'Tools',
    headline: 'Useful before you create an account.',
    status: 'live',
    sections: [
      {
        heading: 'Live tools',
        body: 'These routes perform a real job now. Capability-specific pages remain the source of truth for their inputs, limits, and results.',
        links: [
          { href: APP_ROUTES.YOUTUBE_THUMBNAILS, label: 'YouTube Thumbnails' },
          { href: APP_ROUTES.ARTIST_NOTIFICATIONS, label: 'Fan Notifications' },
          { href: APP_ROUTES.INSTANT_MERCH, label: 'Instant Merch' },
          { href: APP_ROUTES.CLI, label: 'Jovie CLI' },
        ],
      },
    ],
  },
  {
    path: APP_ROUTES.INTEGRATIONS,
    title: 'Jovie Integrations',
    description:
      'The connected services that supply identity, catalog, destination, and audience context.',
    eyebrow: 'Integrations / Capability index',
    headline: 'Connect the source. Keep control of the action.',
    status: 'early-access',
    sections: [
      {
        heading: 'Provider pages follow product proof.',
        body: 'Jovie uses connected and public music sources in existing artist workflows. This index intentionally does not publish provider-specific setup or autonomous-agent claims until each route has exact capability and state evidence.',
      },
      {
        heading: 'Developer access',
        body: 'The public developer guide and API contract document the currently supported integration surface.',
        links: [{ href: APP_ROUTES.DEVELOPERS, label: 'Developer guide' }],
      },
    ],
  },
] as const satisfies readonly MarketingInformationPageDefinition[];

export function getMarketingInformationPage(path: string) {
  return MARKETING_INFORMATION_PAGES.find(page => page.path === path);
}

export function requireMarketingInformationPage(path: string) {
  const page = getMarketingInformationPage(path);
  if (!page) {
    throw new Error(
      `Marketing information page definition is missing: ${path}`
    );
  }
  return page;
}
