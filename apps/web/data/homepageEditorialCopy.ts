import { TIM_WHITE_PROFILE } from '@/lib/tim-white';

/**
 * Homepage copy for `/` (Tim, 2026-11-03: "Music line wins" for the root
 * route only; gbrain decisions/homepage-music-line-scope-2026-11-03-0420).
 *
 * Invite-only go-to-market (decisions/close-public-signup-waitlist-2026-11-02):
 * the page is an editorial story that ends in the role waitlist form. While
 * `PUBLIC_SIGNUP_CLOSED` is on, nothing here links to public signup; the one
 * primary action scrolls to the on-page form.
 *
 * These are the code defaults. The published `marketing-page/home` content
 * record fills the open slots (`lib/content-records/marketing-page.ts`); the
 * headline is locked and has no slot. No prices, plan names or trial terms
 * here: those come from offer truth only. Spec numbers are not copy: they
 * derive from the DSP registry (`components/homepage/v3/home-spec.ts`).
 */

/** In-page anchor for the closing waitlist form. */
export const HOMEPAGE_INVITE_ANCHOR = 'request-invite';

/**
 * Approved homepage "v3" (Tim, 2026-11-08 01:43Z, design-approvals receipt
 * home-canonical-v3). Headlines are single lines (the content record requires
 * it); `HOMEPAGE_HEADLINE_BREAKS` carries where the design breaks each default
 * headline. A published headline that differs wraps naturally.
 */
export const HOMEPAGE_EDITORIAL_COPY = {
  seo: {
    title: 'Jovie | Move your music forward',
  },
  hero: {
    headline: 'Move your music forward.',
    subhead:
      'Your profile, every release and the people who follow your work, in one quiet workspace.',
    primaryAction: 'Request an invite',
    primaryHref: `#${HOMEPAGE_INVITE_ANCHOR}`,
    secondaryAction: 'See a live profile',
    secondaryHref: TIM_WHITE_PROFILE.publicProfilePath,
    note: 'jovie opens by invitation',
    windowLabel:
      'Jovie for Mac: Tim White’s releases with Supernova Girl open in the inspector',
    upcCallout: 'per release',
  },
  /** Chapter index (mono, lowercase, as approved). */
  chapters: ['profile', 'releases', 'specs', 'invitation'],
  chaptersLabel: 'On this page',
  profile: {
    headline: 'One name. Found everywhere.',
    body: 'Your profile at jov.ie leads with what matters now: your latest release, your links, and a way for listeners to get updates.',
    rows: [
      { label: 'Leads with now', value: 'Your newest release, first' },
      { label: 'Every service', value: 'One link to wherever they listen' },
      { label: 'Stay close', value: 'Updates only for people who ask' },
    ],
    alt: 'Tim White’s Jovie profile, Listen mode, with Never Say A Word.',
    handleCallout: 'jov.ie/tim · one handle',
    updatesCallout: 'get updates · opt-in only',
    phone: {
      getUpdates: 'Get Updates',
      listen: 'Listen',
      listenNow: 'Listen now',
    },
  },
  releases: {
    headline: 'Every release, ready on day one.',
    body: 'Your catalog comes in once. Each release gets its own page with listen links for every service, and your profile always leads with the newest one.',
    catalogLabel: 'Tim White’s release catalog in Jovie',
    releasePageLabel: 'The Supernova Girl release page',
    rowCallout: 'catalog row → its own page',
    captions: {
      page: {
        title: 'One page per release.',
        body: 'Cover, title and artists up top, the way the release looks everywhere else.',
      },
      services: {
        title: 'Every service, one tap.',
        body: (listen: number) =>
          `Spotify, Apple Music and YouTube Music up top, then the rest of the ${listen} supported streaming services.`,
      },
      catalog: {
        title: 'Made from your catalog.',
        body: 'Your catalog comes in once, and every release gets its own page.',
      },
    },
  },
  specs: {
    headline: 'The details.',
    body: 'The numbers behind the page, read from the product source.',
    meter: (listen: number, recognised: number) =>
      `${listen} of ${recognised} recognised services are streaming`,
    paletteCaption: {
      lead: 'Everything is one keystroke away.',
      body: 'Jump to a release, open your profile, or run a skill like drafting a pitch.',
    },
    inspectorCaption: {
      lead: 'Every field, inspected.',
      body: 'Date, type, tracks, duration, genres, label and UPC in one panel.',
    },
    upcCallout: 'upc',
    services: {
      label: 'Services',
      listen: { title: 'Streaming services', detail: 'supported' },
      recognised: {
        title: 'Services recognised',
        detail: 'streaming, video and metadata',
      },
    },
    /** Sheet rows after Services: label, then up to three cells. */
    rows: [
      {
        label: 'Identifiers',
        cells: [
          {
            value: 'Per track',
            title: 'ISRC',
            detail: 'on recordings and tracks',
          },
          {
            value: 'Per release',
            title: 'UPC',
            detail: '5054526843813 · Supernova Girl',
          },
        ],
      },
      {
        label: 'Keyboard',
        cells: [
          {
            value: '⌘K',
            title: 'Command palette',
            detail: 'releases, profile, skills',
          },
          {
            value: '⌘1-3',
            title: 'Go to',
            detail: 'Profile, Presence, Connections',
          },
          { value: 'Esc', title: 'Close', detail: 'the command palette' },
        ],
      },
      {
        label: 'Developers',
        cells: [
          {
            value: 'v1',
            title: 'REST API',
            detail: 'openapi spec at /api/v1',
            mono: true,
          },
          {
            value: 'Per artist',
            title: 'MCP server',
            detail: '/api/mcp/{handle}',
            mono: true,
          },
          {
            value: '@jovie/cli',
            title: 'Command line',
            detail: 'published on npm',
            mono: true,
          },
        ],
      },
    ],
  },
  invite: {
    headline: 'Jovie opens by invitation.',
    subhead:
      'Tell us your role and where to reach you. We’ll email you when your spot opens.',
    roleLabel: 'I’m a',
    action: 'Request invite',
    steps: [
      {
        title: 'Tell us who you are',
        body: 'Your role and one email. Under a minute.',
      },
      {
        title: 'We review each request',
        body: 'Jovie opens to a small group at a time.',
      },
      {
        title: 'Your invite arrives',
        body: 'A link to claim your name and bring in your catalog.',
      },
    ],
  },
} as const;

export interface HomepageCatalogRelease {
  readonly title: string;
  readonly byline: string;
  readonly year: string;
  readonly src: string;
  readonly selected?: boolean;
}

/** Tim White's real catalog, as the approved design shows it (newest first). */
export const HOMEPAGE_CATALOG: readonly HomepageCatalogRelease[] = [
  {
    title: 'Never Say A Word',
    byline: 'Tim White',
    year: '2024',
    src: '/img/releases/never-say-a-word.jpg',
  },
  {
    title: 'Take Me Over',
    byline: 'Austin Leeds Remix · Tim White',
    year: '2024',
    src: '/img/releases/take-me-over-remix.jpg',
  },
  {
    title: 'Doge (To Mars)',
    byline: 'Tim White',
    year: '2021',
    src: '/img/releases/doge-to-mars.jpg',
  },
  {
    title: 'Tomorrow Sounds',
    byline: 'Tim White',
    year: '2020',
    src: '/img/releases/tomorrow-sounds.jpg',
  },
  {
    title: 'Supernova Girl',
    byline: 'Tim White',
    year: '2020',
    src: '/img/releases/supernova-girl.jpg',
    selected: true,
  },
  {
    title: 'This Is Love',
    byline: 'Tim White',
    year: '2020',
    src: '/img/releases/this-is-love.jpg',
  },
];

/** The release the profile phone leads with. */
export const HOMEPAGE_LATEST_RELEASE = HOMEPAGE_CATALOG[0];

const SUPERNOVA = '/img/releases/supernova-girl.jpg';

/** Visible strings inside the live product UI on the homepage. */
export const HOMEPAGE_PRODUCT_UI = {
  searchChats: 'Search chats',
  inbox: 'Inbox',
  releases: 'Releases',
  releaseCount: '18',
  searchCommand: 'Search or run a command',
  columns: { title: 'Title', platforms: 'Platforms', released: 'Released' },
  inspector: {
    src: SUPERNOVA,
    title: 'Supernova Girl',
    artist: 'Tim White',
    tabs: ['Details', 'Assets', 'Links', 'Rights'],
    /** Field names as the product inspector shows them (sentence case). */
    fields: {
      date: 'Release date',
      type: 'Type',
      tracks: 'Tracks',
      duration: 'Duration',
      genres: 'Genres',
      label: 'Label',
      upc: 'UPC',
    },
    date: 'Mar 6',
    type: 'Single',
    tracks: '1',
    duration: '2:34',
    genres: ['Melodic Techno', 'Trance'],
    label: 'The Bubblegum Factory',
    upc: '5054526843813',
  },
  releasePage: {
    src: SUPERNOVA,
    title: 'Supernova Girl',
    artist: 'Tim White',
    play: 'Play',
    more: (count: number) => `+${count} more services`,
    madeWith: 'Made with Jovie',
  },
  palette: {
    placeholder: 'Search Jovie or run a command…',
    goToLabel: 'Go To',
    skillsLabel: 'Skills',
    query: 'releases',
    queryTarget: 'Releases',
    goTo: [
      {
        icon: 'profile',
        label: 'Profile',
        description: 'Open your profile in the chat workspace.',
        shortcut: '⌘1',
        selected: true,
      },
      {
        icon: 'presence',
        label: 'Presence',
        description: 'Monitor artist profiles and public pages.',
        shortcut: '⌘2',
      },
      {
        icon: 'connections',
        label: 'Connections',
        description: 'Manage authorized services.',
        shortcut: '⌘3',
      },
      {
        icon: 'chats',
        label: 'Chats',
        description: 'Open the chats workspace.',
      },
      {
        icon: 'releases',
        label: 'Releases',
        description: 'Manage your release catalog.',
      },
    ],
    skills: [
      {
        icon: 'art',
        label: 'Generate album art',
        description: 'Three options for a release.',
      },
      {
        icon: 'pitch',
        label: 'Generate pitch',
        description: 'Draft a release pitch in chat.',
      },
    ],
  },
  keys: { command: 'command' },
} as const;

export const HOMEPAGE_HEADLINE_BREAKS: Readonly<
  Record<string, readonly string[]>
> = {
  [HOMEPAGE_EDITORIAL_COPY.hero.headline]: ['Move your', 'music forward.'],
  [HOMEPAGE_EDITORIAL_COPY.profile.headline]: [
    'One name.',
    'Found everywhere.',
  ],
  [HOMEPAGE_EDITORIAL_COPY.releases.headline]: [
    'Every release,',
    'ready on day one.',
  ],
  [HOMEPAGE_EDITORIAL_COPY.invite.headline]: ['Jovie opens', 'by invitation.'],
};
