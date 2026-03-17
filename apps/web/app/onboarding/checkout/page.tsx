import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getDashboardData } from '@/app/app/(shell)/dashboard/actions';
import { APP_ROUTES } from '@/constants/routes';
import { AuthLayout } from '@/features/auth';
import { resolveUserState, UserState } from '@/lib/auth/gate';
import type { PlanIntentTier } from '@/lib/auth/plan-intent';
import { getPlanIntentFromCookies } from '@/lib/auth/plan-intent';
import { PRICING } from '@/lib/config/pricing';
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
    case 'founding':
      return {
        monthlyPriceId: PRICING.founding.monthly.priceId || '',
        annualPriceId: null,
        monthlyAmount: PRICING.founding.monthly.amount,
        annualAmount: null,
      };
    case 'pro':
      return {
        monthlyPriceId: PRICING.pro.monthly.priceId || '',
        annualPriceId: PRICING.pro.annual.priceId || null,
        monthlyAmount: PRICING.pro.monthly.amount,
        annualAmount: PRICING.pro.annual.amount,
      };
    case 'growth':
      return {
        monthlyPriceId: PRICING.growth.monthly.priceId || '',
        annualPriceId: PRICING.growth.annual.priceId || null,
        monthlyAmount: PRICING.growth.monthly.amount,
        annualAmount: PRICING.growth.annual.amount,
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

export default async function OnboardingCheckoutPage() {
  // Verify authentication
  const authResult = await resolveUserState();
  if (
    !authResult.clerkUserId ||
    authResult.state === UserState.UNAUTHENTICATED
  ) {
    redirect(APP_ROUTES.SIGNIN);
  }

  // Read plan intent from cookie
  const cookieStore = await cookies();
  const cookieHeader = cookieStore
    .getAll()
    .map(c => `${c.name}=${c.value}`)
    .join('; ');
  const planIntent = getPlanIntentFromCookies(cookieHeader);

  // No paid intent — go to dashboard
  if (!planIntent || planIntent === 'free') {
    redirect(APP_ROUTES.DASHBOARD);
  }

  // Resolve Stripe price IDs server-side (secure — never exposed as raw env vars)
  const pricing = resolvePriceIds(planIntent);

  if (!pricing.monthlyPriceId) {
    // Price not configured — skip to dashboard
    redirect(APP_ROUTES.DASHBOARD);
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
      />
    </AuthLayout>
  );
}
