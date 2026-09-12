import { APP_ROUTES } from '@/constants/routes';
import { ENTITLEMENT_REGISTRY } from '@/lib/entitlements/registry';

import {
  type AuthBillingInterval,
  isPaidIntent,
  type PlanIntentTier,
  setPlanIntent,
  validatePlan,
} from './plan-intent';
import {
  persistSignupClaimValue,
  SIGNUP_ARTIST_NAME_KEY,
} from './signup-claim-storage';

export type { AuthBillingInterval };

export type AuthOfferHandoff = {
  readonly plan: PlanIntentTier;
  readonly interval: AuthBillingInterval | null;
  readonly artist: string | null;
};

export type AuthOfferSummary =
  | {
      readonly kind: 'pro-trial';
      readonly title: 'Start your Pro trial';
      readonly detail: '14 days · No card required';
    }
  | {
      readonly kind: 'max-continue';
      readonly title: 'Continue to Max';
    }
  | {
      readonly kind: 'plan-continue';
      readonly title: string;
    }
  | {
      readonly kind: 'subscriber-upgrade';
      readonly title: 'Manage your plan';
      readonly href: typeof APP_ROUTES.SETTINGS_BILLING;
    };

const ARTIST_NAME_MAX_CHARS = 80;
const PRO_TRIAL_DISPLAY_NAME = 'Pro Trial';
const PRO_TRIAL_DAYS_FROM_TAGLINE = /^(\d+) days of Pro\b/;
const EXPECTED_PRO_TRIAL_DAYS = 14;

const PLAN_CONTINUE_TITLES: Record<Exclude<PlanIntentTier, 'free'>, string> = {
  pro: 'Continue to Pro',
  max: 'Continue to Max',
  team: 'Continue to Team',
  enterprise: 'Continue to Enterprise',
};

interface SearchParamReader {
  get(key: string): string | null;
}

export function parseAuthBillingInterval(
  value: string | null | undefined
): AuthBillingInterval | null {
  const normalized = value?.trim().toLowerCase();
  if (normalized === 'monthly' || normalized === 'month') return 'monthly';
  if (
    normalized === 'annual' ||
    normalized === 'yearly' ||
    normalized === 'year'
  ) {
    return 'annual';
  }
  return null;
}

export function parseAuthOfferArtist(
  value: string | null | undefined
): string | null {
  const artist = value
    ?.replaceAll(/[\u0000-\u001F\u007F]/g, '')
    .trim()
    .slice(0, ARTIST_NAME_MAX_CHARS);
  if (!artist) return null;
  if (/^https?:\/\//i.test(artist) || artist.startsWith('//')) return null;
  return artist;
}

export function readAuthOfferHandoff(
  params: SearchParamReader
): AuthOfferHandoff | null {
  const plan = validatePlan(params.get('plan'));
  if (!plan || !isPaidIntent(plan)) return null;

  return {
    plan,
    interval:
      parseAuthBillingInterval(params.get('interval')) ??
      parseAuthBillingInterval(params.get('billing')),
    artist:
      parseAuthOfferArtist(params.get('artist')) ??
      parseAuthOfferArtist(params.get('artist_name')),
  };
}

export function persistAuthOfferHandoff(handoff: AuthOfferHandoff): void {
  setPlanIntent(handoff.plan, {
    interval: handoff.interval,
    artist: handoff.artist,
  });

  if (handoff.artist) {
    persistSignupClaimValue(SIGNUP_ARTIST_NAME_KEY, handoff.artist);
  }
}

export function persistAuthOfferFromSearchParams(
  params: SearchParamReader
): AuthOfferHandoff | null {
  const handoff = readAuthOfferHandoff(params);
  if (handoff) persistAuthOfferHandoff(handoff);
  return handoff;
}

function proTrialTermsMatch(): boolean {
  const trial = ENTITLEMENT_REGISTRY.trial.marketing;
  if (trial.displayName !== PRO_TRIAL_DISPLAY_NAME) return false;
  const days = trial.tagline.match(PRO_TRIAL_DAYS_FROM_TAGLINE)?.[1];
  return days === String(EXPECTED_PRO_TRIAL_DAYS);
}

export function resolveAuthOfferSummary(args: {
  readonly handoff: AuthOfferHandoff | null;
  readonly isPaidSubscriber?: boolean;
}): AuthOfferSummary | null {
  const { handoff, isPaidSubscriber = false } = args;
  if (!handoff) return null;

  if (isPaidSubscriber) {
    return {
      kind: 'subscriber-upgrade',
      title: 'Manage your plan',
      href: APP_ROUTES.SETTINGS_BILLING,
    };
  }

  if (handoff.plan === 'pro' && proTrialTermsMatch()) {
    return {
      kind: 'pro-trial',
      title: 'Start your Pro trial',
      detail: '14 days · No card required',
    };
  }

  if (handoff.plan === 'max') {
    return { kind: 'max-continue', title: 'Continue to Max' };
  }

  if (
    handoff.plan === 'pro' ||
    handoff.plan === 'team' ||
    handoff.plan === 'enterprise'
  ) {
    return {
      kind: 'plan-continue',
      title: PLAN_CONTINUE_TITLES[handoff.plan],
    };
  }

  return null;
}

export function buildAuthOfferContinueUrl(handoff: AuthOfferHandoff): string {
  const routeUrl = new URL(APP_ROUTES.ONBOARDING_CHECKOUT, 'https://n');
  routeUrl.searchParams.set('plan', handoff.plan);
  if (handoff.interval) {
    routeUrl.searchParams.set('interval', handoff.interval);
  }
  if (handoff.artist) {
    routeUrl.searchParams.set('artist_name', handoff.artist);
  }
  return routeUrl.pathname + routeUrl.search;
}

export function resolveAuthenticatedOfferRedirect(args: {
  readonly handoff: AuthOfferHandoff | null;
  readonly isPaidSubscriber?: boolean;
}): string | null {
  const { handoff, isPaidSubscriber = false } = args;
  if (!handoff) return null;
  if (isPaidSubscriber) return APP_ROUTES.SETTINGS_BILLING;
  return buildAuthOfferContinueUrl(handoff);
}
