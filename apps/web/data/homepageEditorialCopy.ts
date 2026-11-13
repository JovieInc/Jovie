import { APP_ROUTES } from '@/constants/routes';
import {
  featuredArtistPossessive,
  featuredArtistPossessiveTitle,
  HOMEPAGE_FEATURED_ARTIST,
} from '@/data/demoArtists';
import { HOMEPAGE_INVITE_ANCHOR } from '@/data/homepageInviteAnchor';
import { claim } from '@/lib/billing/offer/claims';
import { TIM_WHITE_PROFILE } from '@/lib/tim-white';

/**
 * Homepage copy for `/` (Tim, 2026-11-03: "Music line wins" for the root
 * route only; gbrain decisions/homepage-music-line-scope-2026-11-03-0420).
 *
 * One front door (Tim, 2026-11-09): the page is an editorial story that ends
 * in the claim entry, and every door routes into `/start` (the chat
 * onboarding). There is no invitation wording on the page; claiming a handle
 * is open to anyone.
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
    headline: 'The page people find when they look you up.',
    subhead:
      'Jovie is your profile at jov.ie/yourname, showing who you are and everything you make. Tell it what changed and it’s done, and visitors become people you can reach again.',
    primaryAction: 'Claim your handle',
    primaryHref: APP_ROUTES.START,
    secondaryAction: 'See a live profile',
    secondaryHref: TIM_WHITE_PROFILE.publicProfilePath,
    note: claim('profile.free_start_note') ?? '',
    windowLabel: `Jovie for Mac: ${featuredArtistPossessive(HOMEPAGE_FEATURED_ARTIST)} Releases list, beside the ${HOMEPAGE_FEATURED_ARTIST.inspected.title} release page listeners open`,
  },
  /** Chapter index (mono, lowercase, as approved). */
  chapters: ['profile', 'releases', 'specs', 'claim'],
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
  invite: {
    headline: 'Claim your handle.',
    subhead:
      'Your page at jov.ie/yourname is free to claim. Tell Jovie who you are and it sets the page up with you.',
    action: 'Claim your handle',
    claimLabel: 'Your handle',
    claimPlaceholder: 'yourname',
    steps: [
      {
        title: 'Tell Jovie who you are',
        body: 'A few questions, about a minute.',
      },
      {
        title: 'Claim your name',
        body: 'Your page goes up at jov.ie/yourname.',
      },
      {
        title: 'Bring your catalog',
        body: 'Releases import once, and every page matches.',
      },
    ],
  },
} as const;

export const HOMEPAGE_HEADLINE_BREAKS: Readonly<
  Record<string, readonly string[]>
> = {
  [HOMEPAGE_EDITORIAL_COPY.hero.headline]: [
    'The page people find',
    'when they look you up.',
  ],
  [HOMEPAGE_EDITORIAL_COPY.profile.headline]: [
    'One name.',
    'Found everywhere.',
  ],
  [HOMEPAGE_EDITORIAL_COPY.releases.headline]: [
    'Every release,',
    'ready on day one.',
  ],
};
