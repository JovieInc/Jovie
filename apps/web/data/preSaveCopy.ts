import { APP_ROUTES } from '@/constants/routes';

export const PRE_SAVE_FIXTURE = {
  releaseTitle: 'Night Drive',
} as const;

const DEMO_RELEASE_LEAD_DAYS = 21;
const DEMO_RELEASE_HOUR_UTC = 16;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Demo release date for the live countdown on /product/pre-save: three weeks
 * out at 16:00 UTC. Anchored to the UTC day start so server and client agree
 * within a day and the countdown never reads as years away.
 */
export function getPreSaveReleaseAt(now: Date = new Date()): string {
  const dayStart = Math.floor(now.getTime() / DAY_MS) * DAY_MS;
  return new Date(
    dayStart +
      DEMO_RELEASE_LEAD_DAYS * DAY_MS +
      DEMO_RELEASE_HOUR_UTC * 60 * 60 * 1000
  ).toISOString();
}

export const PRE_SAVE_COPY = {
  seo: {
    title: 'Pre-save',
    description:
      'The unreleased page renders a countdown to the release date. Jovie stores an encrypted refresh token for each account. A daily job saves the release into that library after the date passes.',
  },
  headline: 'Pre-save',
  support:
    'The unreleased page renders a countdown to the release date. Jovie stores an encrypted refresh token for each account. A daily job saves the release into that library after the date passes.',
  links: [
    { href: APP_ROUTES.PRODUCT, label: 'Product' },
    { href: APP_ROUTES.SMART_LINKS, label: 'Smart Links' },
    { href: APP_ROUTES.PRICING, label: 'Pricing' },
  ],
} as const;
