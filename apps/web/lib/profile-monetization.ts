import { getPayUrl } from '@/constants/domains';
import { APP_ROUTES, type AppRoute } from '@/constants/routes';

export type ProfilePaymentState =
  | 'needs_profile_url'
  | 'not_setup'
  | 'setup_incomplete'
  | 'ready_no_activity'
  | 'traffic_no_tips'
  | 'active';

export interface ProfileMonetizationSummaryResponse {
  readonly paymentState: ProfilePaymentState;
  readonly provider: 'none' | 'venmo' | 'stripe';
  readonly manageHref: AppRoute;
  readonly tipUrl: string | null;
  readonly tipVisits: number;
  readonly tipsReceived: number;
  readonly totalReceivedCents: number;
  readonly monthReceivedCents: number;
  readonly narrative: string;
}

export interface ResolveProfileMonetizationSummaryInput {
  readonly username: string | null | undefined;
  readonly stripeConnectEnabled: boolean;
  readonly stripeAccountId: string | null | undefined;
  readonly stripeOnboardingComplete: boolean | null | undefined;
  readonly stripePayoutsEnabled: boolean | null | undefined;
  readonly hasVenmoHandle: boolean;
  readonly hasVenmoLink: boolean;
  readonly tipVisits: number;
  readonly tipsReceived: number;
  readonly totalReceivedCents: number;
  readonly monthReceivedCents: number;
}

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

function hasText(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function formatCount(value: number, singular: string, plural: string): string {
  return `${value} ${value === 1 ? singular : plural}`;
}

function formatCurrency(cents: number): string {
  return currencyFormatter.format(cents / 100);
}

function resolveReadyState(
  tipVisits: number,
  tipsReceived: number
): Exclude<
  ProfilePaymentState,
  'needs_profile_url' | 'not_setup' | 'setup_incomplete'
> {
  if (tipsReceived > 0) return 'active';
  if (tipVisits > 0) return 'traffic_no_tips';
  return 'ready_no_activity';
}

function buildNarrative(
  paymentState: ProfilePaymentState,
  provider: ProfileMonetizationSummaryResponse['provider'],
  tipVisits: number,
  tipsReceived: number,
  totalReceivedCents: number
): string {
  switch (paymentState) {
    case 'needs_profile_url':
      return 'Pay links and QR codes need a public profile URL.';
    case 'not_setup':
      return 'Fans cannot pay until payouts are configured.';
    case 'setup_incomplete':
      return provider === 'stripe'
        ? 'Connected, payouts are not live yet.'
        : 'Finish setup to start receiving payments.';
    case 'ready_no_activity':
      return 'No visits yet. Share your link or QR to start.';
    case 'traffic_no_tips':
      return `${formatCount(tipVisits, 'fan opened', 'fans opened')} your pay link. No payments yet.`;
    case 'active':
      return `${formatCount(tipsReceived, 'fan paid', 'fans paid')} you ${formatCurrency(totalReceivedCents)} total.`;
  }
}

export function getProfileMonetizationHeading(
  paymentState: ProfilePaymentState
): string {
  switch (paymentState) {
    case 'needs_profile_url':
      return 'Finish Your Profile URL';
    case 'not_setup':
      return 'Payments Off';
    case 'setup_incomplete':
      return 'Finish Payments Setup';
    case 'ready_no_activity':
    case 'traffic_no_tips':
    case 'active':
      return 'Payments Live';
  }
}

export function getProfileMonetizationPrimaryActionLabel(
  paymentState: ProfilePaymentState,
  stripeConnectEnabled: boolean
): string {
  switch (paymentState) {
    case 'needs_profile_url':
      return 'Set Username';
    case 'not_setup':
      return 'Set Up Payments';
    case 'setup_incomplete':
      return 'Complete Setup';
    case 'ready_no_activity':
    case 'traffic_no_tips':
    case 'active':
      return 'Copy Pay Link';
  }
}

function resolveProvider(
  stripeReady: boolean,
  stripeIncomplete: boolean,
  hasVenmoSetup: boolean,
  hasProfileUrl: boolean
): ProfileMonetizationSummaryResponse['provider'] {
  if (stripeReady || stripeIncomplete) return 'stripe';
  if (hasVenmoSetup && hasProfileUrl) return 'venmo';
  return 'none';
}

export function isProfileMonetizationShareable(
  paymentState: ProfilePaymentState
): boolean {
  return (
    paymentState === 'ready_no_activity' ||
    paymentState === 'traffic_no_tips' ||
    paymentState === 'active'
  );
}

export function resolveProfileMonetizationSummary(
  input: ResolveProfileMonetizationSummaryInput
): ProfileMonetizationSummaryResponse {
  const normalizedUsername = input.username?.trim() ?? '';
  const hasProfileUrl = normalizedUsername.length > 0;
  const hasVenmoSetup = input.hasVenmoHandle || input.hasVenmoLink;
  const hasStripeAccount =
    input.stripeConnectEnabled && hasText(input.stripeAccountId);
  const stripeReady =
    hasStripeAccount &&
    input.stripeOnboardingComplete === true &&
    input.stripePayoutsEnabled === true;
  const stripeIncomplete = hasStripeAccount && !stripeReady;

  let paymentState: ProfilePaymentState;
  if (!hasProfileUrl) {
    paymentState = 'needs_profile_url';
  } else if (stripeReady) {
    paymentState = resolveReadyState(input.tipVisits, input.tipsReceived);
  } else if (stripeIncomplete) {
    paymentState = 'setup_incomplete';
  } else if (hasVenmoSetup) {
    paymentState = resolveReadyState(input.tipVisits, input.tipsReceived);
  } else {
    paymentState = 'not_setup';
  }

  const provider = resolveProvider(
    stripeReady,
    stripeIncomplete,
    hasVenmoSetup,
    hasProfileUrl
  );

  const manageHref: AppRoute =
    input.stripeConnectEnabled && paymentState !== 'needs_profile_url'
      ? APP_ROUTES.SETTINGS_PAYMENTS
      : APP_ROUTES.SETTINGS_ARTIST_PROFILE;

  const tipUrl =
    hasProfileUrl && (stripeReady || hasVenmoSetup)
      ? getPayUrl(normalizedUsername)
      : null;

  return {
    paymentState,
    provider,
    manageHref,
    tipUrl,
    tipVisits: input.tipVisits,
    tipsReceived: input.tipsReceived,
    totalReceivedCents: input.totalReceivedCents,
    monthReceivedCents: input.monthReceivedCents,
    narrative: buildNarrative(
      paymentState,
      provider,
      input.tipVisits,
      input.tipsReceived,
      input.totalReceivedCents
    ),
  };
}
