// Funnel step registry for the conversion judge (JOV-7753). Each step is what
// a prospect sees, in order, from the outreach DM to first use.

/** Outreach DM copy, kept in sync with apps/web/lib/leads/constants.ts. */
export const OUTREACH_DM_TEMPLATE =
  "Hey {displayName}! I found your Linktree and love your music on Spotify. I built Jovie to help artists like you create a better link-in-bio. Here's your free page: {claimLink}";

export function renderOutreachDm({ displayName, claimLink }) {
  return OUTREACH_DM_TEMPLATE.replaceAll(
    '{displayName}',
    displayName
  ).replaceAll('{claimLink}', claimLink);
}

/**
 * @typedef {{
 *   id: string,
 *   label: string,
 *   context: string,
 *   kind: 'page' | 'og-card' | 'interactive',
 *   path?: (handle: string) => string,
 *   valueSelector?: string,
 *   taps?: number,
 *   requires?: string,
 * }} FunnelStep
 */

/** @type {FunnelStep[]} */
export const FUNNEL_STEPS = [
  {
    id: 'outreach',
    label: 'Outreach DM and link preview card',
    context:
      'A stranger DMs you this message. The image is the link preview card your phone shows for the link.',
    kind: 'og-card',
    path: handle => `/${encodeURIComponent(handle)}`,
    taps: 1,
  },
  {
    id: 'claim-landing',
    label: 'Claim link landing (your prebuilt page)',
    context: 'You tapped the link in the DM. This is where it lands.',
    kind: 'page',
    path: handle => `/${encodeURIComponent(handle)}?claim=1`,
    valueSelector: 'h1',
    taps: 1,
  },
  {
    id: 'start',
    label: 'Start onboarding with your handle',
    context:
      'You tapped claim. Jovie opens onboarding with your handle already in the link (/start?handle=...).',
    kind: 'page',
    path: handle => `/start?handle=${encodeURIComponent(handle)}`,
    valueSelector: '[data-funnel-value]',
    taps: 1,
  },
  {
    id: 'qualify-chat',
    label: 'Qualify chat, first reply',
    context: 'You sent your first message; this is the first reply.',
    kind: 'interactive',
    requires: 'chat turn behind Turnstile; needs test-mode capture',
  },
  {
    id: 'profile-reveal',
    label: 'Profile reveal ("here is your page")',
    context: 'Jovie shows the page it built for you.',
    kind: 'interactive',
    requires: 'chat turn behind Turnstile; needs test-mode capture',
  },
  {
    id: 'claim-decision',
    label: 'Claim: reserve or sign up',
    context: 'You decide whether to keep the page.',
    kind: 'interactive',
    requires: 'auth step; needs test-mode capture',
  },
  {
    id: 'upgrade',
    label: 'Upgrade offer and checkout ($199/mo Pro)',
    context: 'Jovie offers the paid plan.',
    kind: 'interactive',
    requires: 'signed-in session + Stripe test mode',
  },
  {
    id: 'first-use',
    label: 'First use after paying',
    context: 'Your first screen inside the app after paying.',
    kind: 'interactive',
    requires: 'paid test account',
  },
];

export const CALIBRATION_STEP_ID = 'start';

export const VIEWPORTS = {
  desktop: {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: false,
  },
  mobile: {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  },
};

/** Lighthouse "slow 4G + 4x CPU" mobile profile, so mobile LCP is honest. */
export const MOBILE_THROTTLE = {
  cpuRate: 4,
  latencyMs: 150,
  downloadBps: (1.6 * 1024 * 1024) / 8,
  uploadBps: (750 * 1024) / 8,
};
