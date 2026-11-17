import {
  featuredArtistPossessive,
  featuredArtistPossessiveTitle,
  HOMEPAGE_FEATURED_ARTIST,
} from '@/data/demoArtists';
import { HOMEPAGE_INVITE_ANCHOR } from '@/data/homepageInviteAnchor';
import { TIM_WHITE_PROFILE } from '@/lib/tim-white';

/**
 * Homepage copy for `/` (Tim, 2026-11-03: "Music line wins" for the root
 * route only; gbrain decisions/homepage-music-line-scope-2026-11-03-0420).
 *
 * Open signup (2026-11-09; Tim, 2026-11-12 23:46Z: "Switch it"): the page is
 * an editorial story whose actions all enter `/start` with the shared
 * claim-profile intent, ending in the `claim` close. While the
 * `PUBLIC_SIGNUP_CLOSED` kill switch is on, the hero action scrolls to the
 * on-page role waitlist form instead and the close is `invite`.
 *
 * These are the code defaults. The published `marketing-page/home` content
 * record fills the open slots (`lib/content-records/marketing-page.ts`); the
 * headline is locked and has no slot. No prices, plan names or trial terms
 * here: those come from offer truth only. Spec numbers are not copy: they
 * derive from the DSP registry (`components/homepage/v3/home-spec.ts`).
 */

export { HOMEPAGE_INVITE_ANCHOR };

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
      'Your profile, every release, and a link to each place the music is streaming.',
    primaryAction: 'Request an invite',
    primaryHref: `#${HOMEPAGE_INVITE_ANCHOR}`,
    secondaryAction: 'See a live profile',
    secondaryHref: TIM_WHITE_PROFILE.publicProfilePath,
    note: 'two fields · we email when your spot opens',
    windowLabel: `Jovie for Mac: ${featuredArtistPossessive(HOMEPAGE_FEATURED_ARTIST)} Releases list, beside the ${HOMEPAGE_FEATURED_ARTIST.inspected.title} release page listeners open`,
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
    alt: `${featuredArtistPossessiveTitle(HOMEPAGE_FEATURED_ARTIST)} Jovie profile, Listen mode, with ${HOMEPAGE_FEATURED_ARTIST.releases[0].title}.`,
    // The handle is printed on the phone beside it; the callout names the idea.
    handleCallout: 'one handle',
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
    catalogLabel: `${featuredArtistPossessiveTitle(HOMEPAGE_FEATURED_ARTIST)} release catalog in Jovie`,
    releasePageLabel: `The ${HOMEPAGE_FEATURED_ARTIST.inspected.title} release page`,
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
        body: 'Title, artwork and UPC carry over from your catalog, so every page matches the release.',
      },
    },
  },
  /**
   * 04 claim: the close while public signup is open (Tim, 2026-11-12 23:46Z:
   * "Switch it"). Code-owned: the `cta` record slots were written for the
   * invitation form, so they apply only to `invite` below. The action label
   * and destination come from the shared claim-profile CTA intent.
   */
  claim: {
    chapter: 'claim',
    headline: 'Claim your name on Jovie.',
    subhead:
      'Find yourself on Spotify and your catalog comes in once. Your profile and a page for every release are ready when you finish.',
    steps: [
      {
        title: 'Find yourself',
        body: 'Your artist name or a Spotify link.',
      },
      {
        title: 'Claim your name',
        body: 'The handle people type to find you.',
      },
      {
        title: 'Go live',
        body: 'Your profile and release pages, built from your catalog.',
      },
    ],
  },
  /** 04 invitation: the close only while `PUBLIC_SIGNUP_CLOSED` is on. */
  invite: {
    headline: 'Jovie opens by invitation.',
    subhead:
      'Tell us your role and where to reach you. We’ll email you when your spot opens.',
    roleLabel: 'I’m a',
    action: 'Request an invite',
    steps: [
      {
        title: 'Tell us who you are',
        body: 'Under a minute.',
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
  [HOMEPAGE_EDITORIAL_COPY.claim.headline]: ['Claim your name', 'on Jovie.'],
};
