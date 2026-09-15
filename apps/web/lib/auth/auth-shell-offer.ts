/** Auth presentation and handoff for the current public offer. */
import { APP_ROUTES } from '@/constants/routes';
import {
  getPlanIntentRecord,
  type PlanIntentRecord,
  parseAuthBillingInterval,
  parseAuthOfferArtist,
  setPlanIntent,
  validatePlan,
} from './plan-intent';
import {
  persistSignupClaimValue,
  SIGNUP_ARTIST_NAME_KEY,
} from './signup-claim-storage';

export { parseAuthBillingInterval, parseAuthOfferArtist } from './plan-intent';
export type AuthOfferHandoff = PlanIntentRecord;

const PRO_MONTHLY_USD = 199;
const PRO_TRIAL_DURATION_DAYS = 14;
const PRO_TRIAL_TRUTH =
  '14-day Pro trial. No credit card. Returns to Free unless you upgrade.';
const FREE_PROFILE_TRUTH =
  'Your artist profile stays free forever. Downgrading restores Jovie branding and keeps audience capture.';
const MAX_EARLY_ACCESS_TRUTH =
  'For labels and multi-artist teams, contact sales. No self-service Max checkout.';

function isSelfServiceOffer(
  plan: string | null | undefined,
  interval: string | null | undefined = 'month'
): boolean {
  return (
    plan === 'free' ||
    (plan === 'pro' && parseAuthBillingInterval(interval) === 'month')
  );
}

function formatUsdAmount(amount: number): string {
  return `$${amount}`;
}

function getPaidPlanPriceUsd(
  plan: 'pro' | 'max',
  interval: 'month' | 'year'
): number {
  if (plan !== 'pro' || interval !== 'month') {
    throw new Error('Only monthly Pro is available for new subscriptions');
  }
  return PRO_MONTHLY_USD;
}

function getPlanCtaLabel(plan: string): string {
  if (plan === 'free') return 'Claim your profile';
  if (plan === 'pro') return `Start ${PRO_TRIAL_DURATION_DAYS}-day Pro trial`;
  return 'Contact sales';
}

function getPlanOfferNote(plan: string): string {
  if (plan === 'free') return FREE_PROFILE_TRUTH;
  if (plan === 'pro') return PRO_TRIAL_TRUTH;
  return MAX_EARLY_ACCESS_TRUTH;
}

interface SearchParamReader {
  get(key: string): string | null;
}

export function readAuthOfferHandoff(
  params: SearchParamReader
): AuthOfferHandoff | null {
  const plan = validatePlan(params.get('plan'));
  if (!plan) return null;
  const rawInterval = params.get('interval') ?? params.get('billing');
  const interval = parseAuthBillingInterval(rawInterval);
  if (rawInterval && !interval) return null;
  return {
    plan,
    interval,
    artist:
      parseAuthOfferArtist(params.get('artist')) ??
      parseAuthOfferArtist(params.get('artist_name')),
  };
}

export function persistAuthOfferHandoff(handoff: AuthOfferHandoff): void {
  setPlanIntent(handoff.plan, handoff);
  if (handoff.artist) {
    try {
      persistSignupClaimValue(SIGNUP_ARTIST_NAME_KEY, handoff.artist);
    } catch {
      /* Auth must work with restricted claim storage. */
    }
  }
}

export function persistAuthOfferFromSearchParams(
  params: SearchParamReader
): AuthOfferHandoff | null {
  const artist =
    parseAuthOfferArtist(params.get('artist')) ??
    parseAuthOfferArtist(params.get('artist_name'));
  if (artist) {
    try {
      persistSignupClaimValue(SIGNUP_ARTIST_NAME_KEY, artist);
    } catch {
      /* Restricted claim storage. */
    }
  }
  const handoff = readAuthOfferHandoff(params);
  if (handoff) persistAuthOfferHandoff(handoff);
  // Recovery without query params may reuse an unexpired intent; invalid explicit intent cannot.
  return handoff ?? (params.get('plan') ? null : getPlanIntentRecord());
}

export function resolveAuthOfferSummary({
  handoff,
  isPaidSubscriber = false,
}: {
  readonly handoff: AuthOfferHandoff | null;
  readonly isPaidSubscriber?: boolean;
}): { readonly title: string; readonly detail?: string } | null {
  if (!handoff) return null;
  if (isPaidSubscriber) return { title: 'Manage your plan' };
  if (!isSelfServiceOffer(handoff.plan, handoff.interval ?? 'month')) {
    return {
      title:
        handoff.plan === 'enterprise' ||
        handoff.plan === 'team' ||
        handoff.plan === 'max'
          ? 'Contact sales'
          : 'Choose an available plan',
    };
  }
  if (handoff.plan === 'free')
    return { title: getPlanCtaLabel('free'), detail: getPlanOfferNote('free') };
  return {
    title: getPlanCtaLabel('pro'),
    detail: `${formatUsdAmount(getPaidPlanPriceUsd('pro', 'month'))}/month · ${getPlanOfferNote('pro')}`,
  };
}

export function buildAuthOfferContinueUrl(handoff: AuthOfferHandoff): string {
  if (!isSelfServiceOffer(handoff.plan, handoff.interval ?? 'month'))
    return APP_ROUTES.PRICING;
  if (handoff.plan === 'free') return APP_ROUTES.DASHBOARD;
  const url = new URL(APP_ROUTES.ONBOARDING_CHECKOUT, 'https://n');
  url.searchParams.set('plan', handoff.plan);
  url.searchParams.set('interval', handoff.interval ?? 'month');
  if (handoff.artist) url.searchParams.set('artist_name', handoff.artist);
  return url.pathname + url.search;
}

export function resolveAuthenticatedOfferRedirect({
  handoff,
  isPaidSubscriber = false,
}: {
  readonly handoff: AuthOfferHandoff | null;
  readonly isPaidSubscriber?: boolean;
}): string | null {
  if (!handoff) return null;
  if (isPaidSubscriber && handoff.plan !== 'free')
    return APP_ROUTES.SETTINGS_BILLING;
  return buildAuthOfferContinueUrl(handoff);
}
