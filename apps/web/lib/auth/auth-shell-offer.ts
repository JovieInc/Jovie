/** Auth presentation and handoff for the current public offer. */
import { APP_ROUTES } from '@/constants/routes';
import {
  formatUsdAmount,
  getPaidPlanPriceUsd,
  getPlanCtaLabel,
  getPlanOfferNote,
  isSelfServiceOffer,
} from '@/lib/billing/offer-truth';
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
