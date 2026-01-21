import * as Sentry from '@sentry/nextjs';
import { redirect } from 'next/navigation';
import { getDashboardData } from '@/app/app/dashboard/actions';
import { AuthLayout } from '@/components/auth';
import { OnboardingFormWrapper } from '@/components/dashboard/organisms/OnboardingFormWrapper';
import { getCachedCurrentUser } from '@/lib/auth/cached';
import { resolveClerkIdentity } from '@/lib/auth/clerk-identity';
import { resolveUserState } from '@/lib/auth/gate';

interface OnboardingPageProps {
  searchParams?: Promise<{
    handle?: string;
  }>;
}

/**
 * Onboarding page - NO MORE REDIRECTS!
 *
 * proxy.ts already routed us here, so we know the user needs onboarding.
 * Just render the onboarding form - no loop detection, no state checks, no redirects.
 */
export default async function OnboardingPage({
  searchParams,
}: OnboardingPageProps) {
  const resolvedSearchParams = await searchParams;

  // proxy.ts already ensured user needsOnboarding
  // Just get user data and render the form
  const authResult = await resolveUserState();

  // Defensive check: ensure we have a valid Clerk user ID
  if (!authResult.clerkUserId) {
    const error = new Error('Missing clerkUserId despite proxy routing');
    Sentry.captureException(error, {
      tags: { context: 'onboarding_defensive_check' },
      level: 'error',
    });
    console.error('[onboarding] Missing clerkUserId despite proxy routing');
    redirect('/signin?redirect_url=/onboarding');
  }

  const user = await getCachedCurrentUser();
  const clerkIdentity = resolveClerkIdentity(user);
  const userEmail = authResult.context.email ?? clerkIdentity.email ?? null;
  const userId = authResult.clerkUserId;

  // Try to get existing profile data if available (user might be partially onboarded)
  // This is optional - if it fails, we just don't pre-fill
  let existingProfile = null;
  try {
    const dashboardData = await getDashboardData();
    existingProfile = dashboardData.selectedProfile;
  } catch (error) {
    // Log the error for debugging - distinguish between expected "no profile" and actual errors
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    console.warn('[onboarding] Failed to load existing profile:', {
      error: errorMessage,
      clerkUserId: authResult.clerkUserId,
    });

    // Capture database/connection errors to Sentry (but not "no profile" errors)
    if (
      errorMessage.includes('database') ||
      errorMessage.includes('connection') ||
      errorMessage.includes('timeout')
    ) {
      Sentry.captureException(error, {
        tags: { context: 'onboarding_profile_load' },
        extra: { clerkUserId: authResult.clerkUserId },
      });
    }
  }

  const displayNameSource = existingProfile?.displayName
    ? 'profile'
    : clerkIdentity.displayNameSource;

  const initialDisplayName =
    existingProfile?.displayName || clerkIdentity.displayName || '';

  const initialHandle =
    resolvedSearchParams?.handle ||
    existingProfile?.username ||
    user?.username ||
    '';

  const skipNameStep =
    displayNameSource === 'profile' ||
    displayNameSource === 'private_metadata_full_name' ||
    displayNameSource === 'clerk_full_name' ||
    displayNameSource === 'clerk_name_parts';

  return (
    <AuthLayout
      formTitle="What's your name?"
      showFooterPrompt={false}
      showFormTitle={false}
      logoSpinDelayMs={10000}
      showLogoutButton
      logoutRedirectUrl='/signin'
    >
      <div className='relative min-h-[500px]'>
        {/* Unified onboarding form */}
        <OnboardingFormWrapper
          initialDisplayName={initialDisplayName}
          initialHandle={initialHandle}
          userEmail={userEmail}
          userId={userId}
          skipNameStep={skipNameStep}
        />
      </div>
    </AuthLayout>
  );
}
