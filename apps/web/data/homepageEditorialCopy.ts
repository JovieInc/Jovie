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
 * here: those come from offer truth only.
 */

/** In-page anchor for the closing waitlist form. */
export const HOMEPAGE_INVITE_ANCHOR = 'request-invite';

/**
 * Approved Pen design "Homepage canonical v1" (receipt home-canonical-v1,
 * 2026-11-07). Headlines are single lines (the content record requires it);
 * `HOMEPAGE_HEADLINE_BREAKS` carries where the design breaks each default
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
    note: 'Jovie opens by invitation.',
    noteCompact: 'Opens by invitation',
  },
  chapters: ['Profile', 'Releases', 'Invitation'],
  chaptersLabel: 'On this page',
  profile: {
    headline: 'One name. Found everywhere.',
    body: 'Your profile at jov.ie leads with what matters now: your latest release, your links, and a way for listeners to get updates.',
    rows: [
      { label: 'Leads with now', value: 'Your newest release, first' },
      { label: 'Every service', value: 'One link to wherever they listen' },
      { label: 'Stay close', value: 'Updates only for people who ask' },
    ],
    alt: 'Tim White’s Jovie profile.',
    phone: {
      getUpdates: 'Get Updates',
      listen: 'Listen',
      listenNow: 'Listen now',
    },
  },
  releases: {
    headline: 'Every release, ready on day one.',
    body: 'Your catalog comes in once. Each release gets its own page with listen links for every service, and your profile always leads with the newest one.',
    catalogLink: 'See the full catalog on jov.ie/tim',
  },
  invite: {
    headline: 'Jovie opens by invitation.',
    subhead:
      'Tell us your role and where to reach you. We’ll email you when your spot opens.',
    roleLabel: 'I’m a',
    action: 'Request invite',
    note: 'One email when your invite is ready. Nothing else.',
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

/** Tim White's real catalog, as shown in the approved design. */
export const HOMEPAGE_RELEASES = [
  {
    title: 'Never Say A Word',
    meta: 'Single · 2024',
    src: '/img/releases/never-say-a-word.jpg',
  },
  {
    title: 'Take Me Over',
    meta: 'Austin Leeds Remix · 2024',
    src: '/img/releases/take-me-over-remix.jpg',
  },
  {
    title: 'The Deep End',
    meta: 'Single · Cosmic Gate & Tim White',
    metaCompact: 'Cosmic Gate & Tim White',
    src: '/img/releases/the-deep-end-art.jpg',
  },
  {
    title: 'Tomorrow Sounds',
    meta: 'Single · 2020',
    src: '/img/releases/tomorrow-sounds.jpg',
  },
] as const;

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
