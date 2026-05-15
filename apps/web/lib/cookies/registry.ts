import {
  AUDIENCE_ANON_COOKIE,
  AUDIENCE_IDENTIFIED_COOKIE,
  COUNTRY_CODE_COOKIE,
  HOMEPAGE_CITY_COOKIE,
  HOMEPAGE_REGION_COOKIE,
} from '@/constants/app';
import { COOKIE_BANNER_REQUIRED_COOKIE } from '@/lib/cookies/consent-regions';
import { CONSENT_COOKIE_NAME } from '@/lib/cookies/consent-state';

export type CookieCategory = 'essential' | 'analytics' | 'marketing';
export type CookieMatch = 'exact' | 'prefix';

export type CookieRegistryEntry = {
  readonly name: string;
  readonly match: CookieMatch;
  readonly category: CookieCategory;
  readonly purpose: string;
  readonly duration: string;
  readonly ttlSeconds: number | null;
  readonly preConsent: boolean;
};

export const COOKIE_REGISTRY = [
  {
    name: CONSENT_COOKIE_NAME,
    match: 'exact',
    category: 'essential',
    purpose: 'Stores your cookie consent preferences.',
    duration: '1 year',
    ttlSeconds: 60 * 60 * 24 * 365,
    preConsent: true,
  },
  {
    name: COOKIE_BANNER_REQUIRED_COOKIE,
    match: 'exact',
    category: 'essential',
    purpose:
      'Stores whether your region requires Jovie to show cookie consent controls.',
    duration: '30 days',
    ttlSeconds: 60 * 60 * 24 * 30,
    preConsent: true,
  },
  {
    name: COUNTRY_CODE_COOKIE,
    match: 'exact',
    category: 'essential',
    purpose:
      'Stores country code for region-appropriate consent and profile localization.',
    duration: '30 days',
    ttlSeconds: 60 * 60 * 24 * 30,
    preConsent: true,
  },
  {
    name: '__clerk_*',
    match: 'prefix',
    category: 'essential',
    purpose: 'Authentication, session management, and account security.',
    duration: 'Session or as configured by Clerk',
    ttlSeconds: null,
    preConsent: true,
  },
  {
    name: '__session',
    match: 'exact',
    category: 'essential',
    purpose: 'Authentication session management.',
    duration: 'Session',
    ttlSeconds: null,
    preConsent: true,
  },
  {
    name: '__client_uat',
    match: 'exact',
    category: 'essential',
    purpose: 'Authentication session freshness check.',
    duration: 'Session',
    ttlSeconds: null,
    preConsent: true,
  },
  {
    name: '__investor_token',
    match: 'exact',
    category: 'essential',
    purpose: 'Investor portal access token for shared private links.',
    duration: '30 days',
    ttlSeconds: 60 * 60 * 24 * 30,
    preConsent: true,
  },
  {
    name: 'jovie_redirect_count',
    match: 'exact',
    category: 'essential',
    purpose: 'Temporary redirect-loop protection for authentication flows.',
    duration: '30 seconds',
    ttlSeconds: 30,
    preConsent: true,
  },
  {
    name: 'jovie_onboarding_session',
    match: 'exact',
    category: 'essential',
    purpose: 'Anonymous onboarding session continuity before account creation.',
    duration: '7 days',
    ttlSeconds: 60 * 60 * 24 * 7,
    preConsent: true,
  },
  {
    name: 'jovie_onboarding_complete',
    match: 'exact',
    category: 'essential',
    purpose: 'Temporary marker that prevents an onboarding redirect loop.',
    duration: 'Session',
    ttlSeconds: null,
    preConsent: true,
  },
  {
    name: 'jovie_pending_claim',
    match: 'exact',
    category: 'essential',
    purpose: 'Maintains a profile claim flow while account creation completes.',
    duration: '7 days',
    ttlSeconds: 60 * 60 * 24 * 7,
    preConsent: true,
  },
  {
    name: 'jovie_plan_intent',
    match: 'exact',
    category: 'essential',
    purpose: 'Stores selected signup plan long enough to complete checkout.',
    duration: '30 minutes',
    ttlSeconds: 60 * 30,
    preConsent: true,
  },
  {
    name: HOMEPAGE_CITY_COOKIE,
    match: 'exact',
    category: 'analytics',
    purpose:
      'Stores city-level location for public profile personalization and analytics.',
    duration: '7 days',
    ttlSeconds: 60 * 60 * 24 * 7,
    preConsent: false,
  },
  {
    name: HOMEPAGE_REGION_COOKIE,
    match: 'exact',
    category: 'analytics',
    purpose:
      'Stores region-level location for public profile personalization and analytics.',
    duration: '7 days',
    ttlSeconds: 60 * 60 * 24 * 7,
    preConsent: false,
  },
  {
    name: AUDIENCE_ANON_COOKIE,
    match: 'exact',
    category: 'analytics',
    purpose:
      'Anonymous visitor identifier used to de-duplicate profile visits and audience analytics.',
    duration: '1 year',
    ttlSeconds: 60 * 60 * 24 * 365,
    preConsent: false,
  },
  {
    name: AUDIENCE_IDENTIFIED_COOKIE,
    match: 'exact',
    category: 'analytics',
    purpose:
      'Records that a browser has been associated with a signed-in Jovie account for audience de-duplication.',
    duration: '1 year',
    ttlSeconds: 60 * 60 * 24 * 365,
    preConsent: false,
  },
] as const satisfies readonly CookieRegistryEntry[];

export const NONESSENTIAL_PROXY_COOKIE_NAMES = [
  HOMEPAGE_CITY_COOKIE,
  HOMEPAGE_REGION_COOKIE,
  AUDIENCE_ANON_COOKIE,
  AUDIENCE_IDENTIFIED_COOKIE,
] as const;

export function isRegisteredCookieName(cookieName: string): boolean {
  return COOKIE_REGISTRY.some(entry => {
    if (entry.match === 'exact') return entry.name === cookieName;
    return cookieName.startsWith(entry.name.replace('*', ''));
  });
}

export function getCookiesByCategory(category: CookieCategory) {
  return COOKIE_REGISTRY.filter(entry => entry.category === category);
}
