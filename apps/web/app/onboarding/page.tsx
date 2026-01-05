import { currentUser } from '@clerk/nextjs/server';
import { getDashboardData } from '@/app/app/dashboard/actions';
import { AuthLayout } from '@/components/auth';
import { OnboardingFormWrapper } from '@/components/dashboard/organisms/OnboardingFormWrapper';
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
  const user = await currentUser();
  const clerkIdentity = resolveClerkIdentity(user);
  const userEmail = authResult.context.email ?? clerkIdentity.email ?? null;
  const userId = authResult.clerkUserId!;

  // Try to get existing profile data if available (user might be partially onboarded)
  // This is optional - if it fails, we just don't pre-fill
  let existingProfile = null;
  try {
    const dashboardData = await getDashboardData();
    existingProfile = dashboardData.selectedProfile;
  } catch {
    // User might not have profile yet - that's fine, they're onboarding
    console.log(
      '[onboarding] No existing profile found (expected for new users)'
    );
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
