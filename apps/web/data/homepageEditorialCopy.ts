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

export const HOMEPAGE_EDITORIAL_COPY = {
  seo: {
    title: 'Jovie | Move your music forward',
  },
  hero: {
    headline: 'Jovie helps you move your music forward.',
    subhead:
      'Your profile, every release, and the people who follow your work, run from one quiet workspace. Jovie opens by invitation.',
    primaryAction: 'Request an Invite',
    primaryHref: `#${HOMEPAGE_INVITE_ANCHOR}`,
    secondaryAction: 'See a Live Profile',
    secondaryHref: TIM_WHITE_PROFILE.publicProfilePath,
  },
  profile: {
    headline: 'One name. Everywhere you’re found.',
    body: 'Your profile at jov.ie/you leads with what matters now: your latest release, your links, and a way for listeners to get updates.',
    scenarioId: 'template-profile-live-mobile',
    alt: 'A Jovie profile at jov.ie/you with its latest release first.',
  },
  releases: {
    headline: 'Every release, ready on day one.',
    body: 'Your catalog comes in once. Each release gets its own page with listen links for every service, and your profile always leads with the newest one.',
    workspace: {
      scenarioId: 'dashboard-releases-desktop',
      alt: 'The Jovie releases workspace with three live releases.',
    },
    release: {
      scenarioId: 'profile-state-release-mobile',
      alt: 'A profile featuring the release Take Me Over with a Listen Now button.',
    },
  },
  invite: {
    headline: 'Request an invitation.',
    subhead:
      'Jovie opens to a small group at a time. Tell us your role and where to reach you, and we’ll email you when your spot opens.',
  },
} as const;
