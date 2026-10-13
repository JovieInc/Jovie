import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getDashboardData } from '@/app/app/(shell)/dashboard/actions';
import { APP_ROUTES } from '@/constants/routes';

import {
  CanonicalUserState,
  getRedirectForState,
  resolveUserState,
} from '@/lib/auth/gate';
import type { PlanIntentTier } from '@/lib/auth/plan-intent';
import {
  DEFAULT_UPSELL_PLAN,
  getPlanIntentFromCookies,
  isPaidIntent,
  recommendPlan,
  validatePlan,
} from '@/lib/auth/plan-intent';
import { isSelfServiceOffer } from '@/lib/billing/offer-truth';
import { PRICING } from '@/lib/config/pricing';
import { normalizeOnboardingReturnTo } from '@/lib/onboarding/return-to';
import {
  hasOnboardingUpgradeOfferState,
  recordOnboardingUpgradeOfferEvent,
} from '@/lib/onboarding/upgrade-offer';
import { loadClaimTimeProof } from '@/lib/proof/claim-time-proof.server';
import { OnboardingCheckoutClient } from './OnboardingCheckoutClient';

/**
 * Map a plan tier to its Stripe price IDs for checkout.
 * Returns monthly and optional annual price IDs.
 */
function resolvePriceIds(plan: PlanIntentTier): {
  monthlyPriceId: string;
  annualPriceId: string | null;
  monthlyAmount: number;
  annualAmount: number | null;
} {
  switch (plan) {
    case 'pro':
      return {
        monthlyPriceId: PRICING.pro.monthly.priceId || '',
        annualPriceId: null,
        monthlyAmount: PRICING.pro.monthly.amount,
        annualAmount: null,
      };
    default:
      return {
        monthlyPriceId: '',
        annualPriceId: null,
        monthlyAmount: 0,
        annualAmount: null,
      };
  }
}

export const dynamic = 'force-dynamic';

export default async function OnboardingCheckoutPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>) {
  // Verify authentication
  const authResult = await resolveUserState();
  if (
    !authResult.clerkUserId ||
    authResult.state === CanonicalUserState.UNAUTHENTICATED
  ) {
    redirect(APP_ROUTES.SIGNIN);
  }

  // Read plan intent from cookie, falling back to ?plan= query param
  const cookieStore = await cookies();
  const cookieHeader = cookieStore
    .getAll()
    .map(c => `${c.name}=${c.value}`)
    .join('; ');
  let planIntent: PlanIntentTier | null =
    getPlanIntentFromCookies(cookieHeader);

  const params = await searchParams;
  if (!planIntent) {
    const planParam = typeof params.plan === 'string' ? params.plan : null;
    planIntent = validatePlan(planParam);
  }

  // Determine if this is an organic upsell vs explicit paid intent
  // source= query param is authoritative (set by navigateAfterOnboarding)
  const sourceParam = typeof params.source === 'string' ? params.source : null;
  const isDefaultUpsell = sourceParam !== 'intent';

  // If no paid intent, temporarily default to pro (may be overridden by recommendPlan below)
  if (!planIntent || !isPaidIntent(planIntent)) {
    planIntent = DEFAULT_UPSELL_PLAN;
  }

  const interval =
    params.interval ??
    cookieStore.get('jovie_billing_interval')?.value ??
    'month';
  if (
    typeof interval !== 'string' ||
    !isSelfServiceOffer(planIntent, interval)
  ) {
    redirect(APP_ROUTES.PRICING);
  }

  // Get profile data for the value preview
  let profileData: {
    id: string | null;
    displayName: string;
    username: string;
    avatarUrl: string | null;
    spotifyFollowers: number | null;
  } = {
    id: null,
    displayName: '',
    username: '',
    avatarUrl: null,
    spotifyFollowers: null,
  };

  try {
    const dashboardData = await getDashboardData();
    const profile = dashboardData.selectedProfile;
    if (profile) {
      profileData = {
        id: profile.id ?? null,
        displayName: profile.displayName || '',
        username: profile.username || '',
        avatarUrl: profile.avatarUrl || null,
        spotifyFollowers:
          ((profile as Record<string, unknown>).spotifyFollowers as
            | number
            | null) ?? null,
      };
    }
  } catch {
    // Profile load failed — proceed with empty data
  }

  // Smart plan recommendation only for organic users with no expressed paid intent.
  // If the user has a paid-intent cookie (e.g., founding), preserve it — don't override
  // with recommendPlan. Also fall back to pro if Max plan is disabled.
  const hadPaidIntentFromCookie = isPaidIntent(
    getPlanIntentFromCookies(cookieHeader)
  );
  if (isDefaultUpsell && !hadPaidIntentFromCookie) {
    let recommended = recommendPlan(profileData.spotifyFollowers);
    if (!isSelfServiceOffer(recommended)) {
      recommended = DEFAULT_UPSELL_PLAN;
    }
    planIntent = recommended;
  }

  const returnTo = normalizeOnboardingReturnTo(
    typeof params.returnTo === 'string' ? params.returnTo : null
  );

  // JOV-6675: the Artist Presence upgrade offer surfaces at most once per
  // claimed artist. Any prior seen/accepted/dismissed receipt means the offer
  // was already presented — skip straight to the post-onboarding destination
  // instead of nagging. Only the organic upsell is gated; an explicit
  // paid-intent visit (source=intent) is artist-initiated checkout, not an
  // offer impression.
  if (isDefaultUpsell && profileData.id) {
    const alreadyOffered = await hasOnboardingUpgradeOfferState(profileData.id);
    if (alreadyOffered) {
      redirect(returnTo);
    }
  }

  // Resolve Stripe price IDs server-side (secure — never exposed as raw env vars)
  const pricing = resolvePriceIds(planIntent);

  if (!pricing.monthlyPriceId) {
    // Price not configured — skip checkout. Incomplete profiles must return
    // to onboarding, not /app (the shell immediately redirects them back to
    // /start and can loop with /onboarding/checkout — JOV-2454 / ENG-002).
    const stateRedirect = getRedirectForState(authResult.state);
    redirect(stateRedirect ?? APP_ROUTES.DASHBOARD);
  }

  // Durable server-side "offer seen" receipt, recorded only when the offer
  // will actually render, so the once-per-artist gate above is reliable.
  if (isDefaultUpsell && profileData.id) {
    await recordOnboardingUpgradeOfferEvent(profileData.id, 'seen', planIntent);
  }

  // JOV-7794: the paywall carries the visitor's own computed proof.
  const proofFindings = profileData.id
    ? await loadClaimTimeProof(profileData.id)
    : [];

  return (
    <OnboardingCheckoutClient
      plan={planIntent}
      profileId={profileData.id}
      monthlyPriceId={pricing.monthlyPriceId}
      annualPriceId={pricing.annualPriceId}
      monthlyAmount={pricing.monthlyAmount}
      annualAmount={pricing.annualAmount}
      displayName={profileData.displayName}
      username={profileData.username}
      avatarUrl={profileData.avatarUrl}
      spotifyFollowers={profileData.spotifyFollowers}
      isDefaultUpsell={isDefaultUpsell}
      proofFindings={proofFindings}
    />
  );
}
