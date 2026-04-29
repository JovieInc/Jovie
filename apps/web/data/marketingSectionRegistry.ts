import { APP_ROUTES } from '@/constants/routes';

export type MarketingSectionFamily =
  | 'Hero'
  | 'Proof'
  | 'Product Story'
  | 'Conversion'
  | 'Pricing'
  | 'FAQ'
  | 'Editorial'
  | 'System';

export type MarketingSectionStatus =
  | 'Keep'
  | 'Variant Copy'
  | 'Candidate'
  | 'Consolidate'
  | 'Delete Review';

export type MarketingSectionPreviewKind =
  | 'poster'
  | 'logo-strip'
  | 'rail'
  | 'split'
  | 'grid'
  | 'list'
  | 'cta'
  | 'article';

export interface MarketingSectionCopyVariant {
  readonly id: string;
  readonly label: string;
  readonly headline: string;
  readonly body?: string;
}

export interface MarketingSectionEntry {
  readonly id: string;
  readonly label: string;
  readonly family: MarketingSectionFamily;
  readonly status: MarketingSectionStatus;
  readonly currentPages: readonly string[];
  readonly candidatePages: readonly string[];
  readonly copyVariants: readonly MarketingSectionCopyVariant[];
  readonly testId?: string;
  readonly preview: {
    readonly kind: MarketingSectionPreviewKind;
    readonly headline: string;
    readonly body?: string;
    readonly metric?: string;
    readonly chips?: readonly string[];
  };
}

export const MARKETING_SECTION_PAGES = [
  'Homepage',
  'Artist Profiles',
  'Artist Notifications',
  'Pricing',
  'Support',
  'About',
  'Blog',
  'Changelog',
  'Compare',
  'Alternatives',
  'Launch',
  'Pay',
  'Demo',
] as const;

export const MARKETING_SECTION_STATUSES: readonly MarketingSectionStatus[] = [
  'Keep',
  'Variant Copy',
  'Candidate',
  'Consolidate',
  'Delete Review',
] as const;

export const MARKETING_SECTION_FAMILIES: readonly MarketingSectionFamily[] = [
  'Hero',
  'Proof',
  'Product Story',
  'Conversion',
  'Pricing',
  'FAQ',
  'Editorial',
  'System',
] as const;

export const MARKETING_SECTION_REGISTRY: readonly MarketingSectionEntry[] = [
  {
    id: 'homepage.hero',
    label: 'Homepage Hero',
    family: 'Hero',
    status: 'Keep',
    currentPages: ['Homepage'],
    candidatePages: [],
    testId: 'homepage-hero-shell',
    copyVariants: [
      {
        id: 'release-workspace',
        label: 'Current',
        headline: 'Release more music with less work.',
        body: 'Plan releases, create assets, pitch playlists, and promote every drop from one AI workspace.',
      },
    ],
    preview: {
      kind: 'poster',
      headline: 'Release more music with less work.',
      body: 'Product screenshots, carousel, and direct signup intent.',
      chips: ['Plan Releases', 'Create Assets', 'Pitch Playlists'],
    },
  },
  {
    id: 'homepage.trust',
    label: 'Trust Strip',
    family: 'Proof',
    status: 'Keep',
    currentPages: ['Homepage', 'Artist Profiles', 'Artist Notifications'],
    candidatePages: ['Pricing', 'Launch'],
    testId: 'homepage-trust',
    copyVariants: [
      { id: 'artists-on', label: 'Default', headline: 'Trusted by artists on' },
      { id: 'artists', label: 'Compact', headline: 'Trusted by artists' },
    ],
    preview: {
      kind: 'logo-strip',
      headline: 'Trusted by artists',
      body: 'A restrained proof beat that should stay near the first viewport.',
      chips: ['Labels', 'Artists', 'Partners'],
    },
  },
  {
    id: 'homepage.outcomes',
    label: 'Outcome Cards',
    family: 'Product Story',
    status: 'Keep',
    currentPages: ['Homepage', 'Artist Profiles'],
    candidatePages: ['Artist Notifications'],
    testId: 'homepage-outcome-cards',
    copyVariants: [
      {
        id: 'artist-outcomes',
        label: 'Outcome Led',
        headline: 'Built for every artist outcome.',
      },
    ],
    preview: {
      kind: 'rail',
      headline: 'Drive streams. Sell out. Get paid. Share anywhere.',
      body: 'A horizontal outcome rail for tangible artist wins.',
      chips: ['Streams', 'Shows', 'Payments', 'Sharing'],
    },
  },
  {
    id: 'homepage.pricing',
    label: 'Homepage Pricing',
    family: 'Pricing',
    status: 'Keep',
    currentPages: ['Homepage'],
    candidatePages: ['Pricing'],
    testId: 'homepage-v2-pricing',
    copyVariants: [
      { id: 'simple', label: 'Current', headline: 'Simple Pricing.' },
    ],
    preview: {
      kind: 'grid',
      headline: 'Simple Pricing.',
      body: 'Single-plan teaser that links into checkout intent.',
      metric: '$39/mo',
    },
  },
  {
    id: 'homepage.final-cta',
    label: 'Locked Final CTA',
    family: 'Conversion',
    status: 'Keep',
    currentPages: ['Homepage'],
    candidatePages: ['Artist Profiles', 'Artist Notifications', 'Pricing'],
    testId: 'homepage-v2-final-cta',
    copyVariants: [
      {
        id: 'today-free',
        label: 'Locked',
        headline: 'Start using Jovie today for free.',
      },
    ],
    preview: {
      kind: 'cta',
      headline: 'Start using Jovie today for free.',
      body: 'Locked ray field, compact button, no media background.',
      chips: ['Locked'],
    },
  },
  {
    id: 'homepage.system-overview',
    label: 'System Overview',
    family: 'System',
    status: 'Keep',
    currentPages: ['Homepage'],
    candidatePages: ['Artist Profiles'],
    testId: 'homepage-v2-system-overview',
    copyVariants: [
      {
        id: 'cycle',
        label: 'Current',
        headline: 'One system for the whole release cycle.',
      },
    ],
    preview: {
      kind: 'grid',
      headline: 'One system for the whole release cycle.',
      body: 'Three product cards covering profiles, notifications, and release pages.',
      chips: ['Profiles', 'Notifications', 'Release Pages'],
    },
  },
  {
    id: 'homepage.spotlight',
    label: 'Profile Spotlight',
    family: 'Product Story',
    status: 'Variant Copy',
    currentPages: ['Homepage', 'Artist Profiles'],
    candidatePages: [],
    testId: 'homepage-v2-spotlight',
    copyVariants: [
      {
        id: 'convert',
        label: 'Landing',
        headline: 'Artist profiles built to convert.',
      },
      {
        id: 'sync',
        label: 'Homepage',
        headline: 'One Link. Always In Sync.',
      },
    ],
    preview: {
      kind: 'split',
      headline: 'Artist profiles built to convert.',
      body: 'Phone preview and adaptive profile story.',
      chips: ['Listen', 'Follow', 'Notify'],
    },
  },
  {
    id: 'homepage.capture-reactivate',
    label: 'Capture And Reactivate',
    family: 'Product Story',
    status: 'Keep',
    currentPages: ['Homepage', 'Artist Profiles', 'Artist Notifications'],
    candidatePages: [],
    testId: 'homepage-v2-capture-reactivate',
    copyVariants: [
      {
        id: 'capture-release',
        label: 'Current',
        headline: 'Capture every fan. Send them every release automatically.',
      },
    ],
    preview: {
      kind: 'split',
      headline: 'Capture every fan. Send them every release automatically.',
      body: 'Two-panel story for subscribe, segment, and notify loops.',
      chips: ['Capture', 'Segment', 'Notify'],
    },
  },
  {
    id: 'artist-profile.hero',
    label: 'Artist Profile Hero',
    family: 'Hero',
    status: 'Keep',
    currentPages: ['Artist Profiles'],
    candidatePages: ['Homepage'],
    testId: 'artist-profile-section-hero',
    copyVariants: [
      {
        id: 'profile-conversion',
        label: 'Current',
        headline: 'Artist profiles built to convert.',
      },
    ],
    preview: {
      kind: 'poster',
      headline: 'Artist profiles built to convert.',
      body: 'Centered hero with product phone preview and signup CTA.',
    },
  },
  {
    id: 'artist-profile.adaptive',
    label: 'Adaptive Profile Sequence',
    family: 'Product Story',
    status: 'Keep',
    currentPages: ['Artist Profiles'],
    candidatePages: ['Homepage'],
    testId: 'artist-profile-section-adaptive',
    copyVariants: [
      {
        id: 'one-profile',
        label: 'Current',
        headline: 'One profile for every release state.',
      },
    ],
    preview: {
      kind: 'split',
      headline: 'One profile for every release state.',
      body: 'Mode switcher and phone frame for pre-release, live, and touring states.',
      chips: ['Pre-save', 'Release', 'Tour'],
    },
  },
  {
    id: 'artist-profile.monetization',
    label: 'Monetization',
    family: 'Conversion',
    status: 'Candidate',
    currentPages: ['Artist Profiles'],
    candidatePages: ['Pay', 'Pricing'],
    testId: 'artist-profile-section-monetization',
    copyVariants: [
      {
        id: 'fan-payments',
        label: 'Current',
        headline: 'Turn profile traffic into revenue.',
      },
    ],
    preview: {
      kind: 'rail',
      headline: 'Turn profile traffic into revenue.',
      body: 'Payment surface, tip rows, and artist revenue framing.',
      metric: '$128',
    },
  },
  {
    id: 'artist-profile.spec-wall',
    label: 'Power Feature Wall',
    family: 'System',
    status: 'Consolidate',
    currentPages: ['Homepage', 'Artist Profiles', 'Artist Notifications'],
    candidatePages: ['Homepage'],
    testId: 'artist-profile-section-spec-wall',
    copyVariants: [
      { id: 'details', label: 'Current', headline: 'Details that matter.' },
    ],
    preview: {
      kind: 'grid',
      headline: 'Details that matter.',
      body: 'Dense feature wall that may consolidate several repeated capability grids.',
      chips: ['Routing', 'Analytics', 'Capture', 'Sync'],
    },
  },
  {
    id: 'notifications.hero',
    label: 'Notifications Hero',
    family: 'Hero',
    status: 'Keep',
    currentPages: ['Artist Notifications'],
    candidatePages: ['Homepage'],
    testId: 'artist-notifications-section-hero',
    copyVariants: [
      {
        id: 'notify',
        label: 'Current',
        headline: 'Bring fans back for every drop.',
      },
    ],
    preview: {
      kind: 'poster',
      headline: 'Bring fans back for every drop.',
      body: 'Floating notification cards and capture outcome proof.',
      chips: ['Email', 'SMS', 'Click'],
    },
  },
  {
    id: 'notifications.benefits',
    label: 'Notification Benefits',
    family: 'Product Story',
    status: 'Consolidate',
    currentPages: ['Artist Notifications'],
    candidatePages: ['Artist Profiles', 'Homepage'],
    testId: 'artist-notifications-section-benefits',
    copyVariants: [{ id: 'pays', label: 'Current', headline: 'Why it pays.' }],
    preview: {
      kind: 'list',
      headline: 'Why it pays.',
      body: 'Benefit list for conversion and repeat audience reach.',
      chips: ['Own Fans', 'Lower Waste', 'Repeat Reach'],
    },
  },
  {
    id: 'shared.faq',
    label: 'Shared FAQ',
    family: 'FAQ',
    status: 'Variant Copy',
    currentPages: [
      'Artist Profiles',
      'Artist Notifications',
      'Support',
      'Compare',
      'Alternatives',
      'Homepage',
    ],
    candidatePages: ['Pricing'],
    testId: 'artist-profile-section-faq',
    copyVariants: [
      {
        id: 'profile',
        label: 'Profile',
        headline: 'Questions artists ask before switching.',
      },
      {
        id: 'notifications',
        label: 'Notifications',
        headline: 'Questions about fan notifications.',
      },
    ],
    preview: {
      kind: 'list',
      headline: 'Questions artists ask before switching.',
      body: 'Accordion content should stay page-specific while using one primitive.',
      chips: ['Setup', 'Pricing', 'Migration'],
    },
  },
  {
    id: 'pricing.main',
    label: 'Pricing Page',
    family: 'Pricing',
    status: 'Keep',
    currentPages: ['Pricing'],
    candidatePages: ['Homepage'],
    copyVariants: [
      {
        id: 'simple',
        label: 'Current',
        headline: 'Simple pricing for serious artists.',
      },
    ],
    preview: {
      kind: 'grid',
      headline: 'Simple pricing for serious artists.',
      body: 'Dedicated pricing grid and comparison chart.',
      metric: '$39/mo',
    },
  },
  {
    id: 'support.channels',
    label: 'Support Channels',
    family: 'Editorial',
    status: 'Candidate',
    currentPages: ['Support'],
    candidatePages: ['Pricing', 'Pay'],
    copyVariants: [
      {
        id: 'help',
        label: 'Current',
        headline: 'Get help from the team building Jovie.',
      },
    ],
    preview: {
      kind: 'list',
      headline: 'Get help from the team building Jovie.',
      body: 'Support cards and CTA for product questions.',
      chips: ['Email', 'Status', 'Docs'],
    },
  },
  {
    id: 'editorial.indexes',
    label: 'Editorial Indexes',
    family: 'Editorial',
    status: 'Delete Review',
    currentPages: ['Blog', 'Changelog'],
    candidatePages: ['Resources'],
    copyVariants: [
      {
        id: 'resources',
        label: 'Current',
        headline: 'Latest writing and product updates.',
      },
    ],
    preview: {
      kind: 'article',
      headline: 'Latest writing and product updates.',
      body: 'Blog and changelog may share a calmer editorial shell.',
      chips: ['Blog', 'Changelog'],
    },
  },
  {
    id: 'comparison.hero',
    label: 'Comparison Hero',
    family: 'Hero',
    status: 'Consolidate',
    currentPages: ['Compare', 'Alternatives'],
    candidatePages: ['Pricing'],
    copyVariants: [
      {
        id: 'switching',
        label: 'Current',
        headline: 'Choose the right artist profile system.',
      },
    ],
    preview: {
      kind: 'split',
      headline: 'Choose the right artist profile system.',
      body: 'Reusable comparison hero for direct competitor and alternative pages.',
      chips: ['Compare', 'Switch', 'Decide'],
    },
  },
  {
    id: 'launch.story',
    label: 'Launch Story',
    family: 'Product Story',
    status: 'Delete Review',
    currentPages: ['Launch'],
    candidatePages: ['Homepage'],
    copyVariants: [
      {
        id: 'launch',
        label: 'Current',
        headline: 'Launch every release with less manual work.',
      },
    ],
    preview: {
      kind: 'article',
      headline: 'Launch every release with less manual work.',
      body: 'Long-form launch page sections need consolidation before reuse.',
      chips: ['Audit', 'Merge', 'Delete'],
    },
  },
  {
    id: 'pay.hero',
    label: 'Pay Hero',
    family: 'Conversion',
    status: 'Candidate',
    currentPages: ['Pay'],
    candidatePages: ['Artist Profiles', 'Pricing'],
    copyVariants: [
      {
        id: 'payments',
        label: 'Current',
        headline: 'Let fans pay you directly.',
      },
    ],
    preview: {
      kind: 'cta',
      headline: 'Let fans pay you directly.',
      body: 'Payment-specific conversion module for pricing and profile pages.',
      metric: '$24',
    },
  },
  {
    id: 'demo.video',
    label: 'Video Demo',
    family: 'Proof',
    status: 'Candidate',
    currentPages: ['Demo'],
    candidatePages: ['Homepage', 'Pricing'],
    copyVariants: [
      { id: 'watch', label: 'Current', headline: 'Watch Jovie in action.' },
    ],
    preview: {
      kind: 'poster',
      headline: 'Watch Jovie in action.',
      body: 'Demo module for visitors who need to inspect the product before signing up.',
      chips: ['Play', 'Product', 'Proof'],
    },
  },
] as const;

export const MARKETING_SECTION_LAB_ROUTE = APP_ROUTES.EXP_DESIGN_STUDIO;

export const MARKETING_SECTION_PRIMARY_PAGE_BY_ROUTE = {
  [APP_ROUTES.HOME]: 'Homepage',
  [APP_ROUTES.ARTIST_PROFILES]: 'Artist Profiles',
  [APP_ROUTES.ARTIST_NOTIFICATIONS]: 'Artist Notifications',
  [APP_ROUTES.PRICING]: 'Pricing',
  [APP_ROUTES.SUPPORT]: 'Support',
  [APP_ROUTES.ABOUT]: 'About',
  [APP_ROUTES.BLOG]: 'Blog',
  [APP_ROUTES.CHANGELOG]: 'Changelog',
  [APP_ROUTES.COMPARE]: 'Compare',
  [APP_ROUTES.ALTERNATIVES]: 'Alternatives',
  [APP_ROUTES.LAUNCH]: 'Launch',
  [APP_ROUTES.PAY]: 'Pay',
  [APP_ROUTES.DEMO_VIDEO]: 'Demo',
} as const;
