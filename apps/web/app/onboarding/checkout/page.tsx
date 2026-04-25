import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getDashboardData } from '@/app/app/(shell)/dashboard/actions';
import { APP_ROUTES } from '@/constants/routes';
import { AuthLayout } from '@/features/auth';
import { CanonicalUserState, resolveUserState } from '@/lib/auth/gate';
import type { PlanIntentTier } from '@/lib/auth/plan-intent';
import {
  DEFAULT_UPSELL_PLAN,
  getPlanIntentFromCookies,
  isPaidIntent,
  recommendPlan,
  validatePlan,
} from '@/lib/auth/plan-intent';
import { PRICING } from '@/lib/config/pricing';
import { isMaxPlanEnabled } from '@/lib/stripe/config';
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
        annualPriceId: PRICING.pro.annual.priceId || null,
        monthlyAmount: PRICING.pro.monthly.amount,
        annualAmount: PRICING.pro.annual.amount,
      };
    case 'max':
      return {
        monthlyPriceId: PRICING.max.monthly.priceId || '',
        annualPriceId: PRICING.max.annual.priceId || null,
        monthlyAmount: PRICING.max.monthly.amount,
        annualAmount: PRICING.max.annual.amount,
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

  // Get profile data for the value preview
  let profileData: {
    displayName: string;
    username: string;
    avatarUrl: string | null;
    spotifyFollowers: number | null;
  } = {
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
  // If the user has a paid-intent cookie (e.g., pro), preserve it — don't override
  // with recommendPlan. Also fall back to pro if Max plan is disabled.
  const hadPaidIntentFromCookie = isPaidIntent(
    getPlanIntentFromCookies(cookieHeader)
  );
  if (isDefaultUpsell && !hadPaidIntentFromCookie) {
    let recommended = recommendPlan(profileData.spotifyFollowers);
    if (recommended === 'max' && !isMaxPlanEnabled()) {
      recommended = DEFAULT_UPSELL_PLAN;
    }
    planIntent = recommended;
  }

  // Resolve Stripe price IDs server-side (secure — never exposed as raw env vars)
  const pricing = resolvePriceIds(planIntent);

  if (!pricing.monthlyPriceId) {
    // Price not configured — skip to dashboard
    redirect(APP_ROUTES.DASHBOARD);
  }

  return (
    <AuthLayout
      formTitle='Upgrade your profile'
      showFooterPrompt={false}
      showFormTitle={false}
      logoSpinDelayMs={10000}
    >
      <OnboardingCheckoutClient
        plan={planIntent}
        monthlyPriceId={pricing.monthlyPriceId}
        annualPriceId={pricing.annualPriceId}
        monthlyAmount={pricing.monthlyAmount}
        annualAmount={pricing.annualAmount}
        displayName={profileData.displayName}
        username={profileData.username}
        avatarUrl={profileData.avatarUrl}
        spotifyFollowers={profileData.spotifyFollowers}
        isDefaultUpsell={isDefaultUpsell}
      />
    </AuthLayout>
  );
}
