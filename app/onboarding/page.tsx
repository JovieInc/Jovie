// import { OnboardingForm } from '@/components/dashboard'; // Kept for fallback

import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { OnboardingFormWrapper } from '@/components/dashboard/organisms/OnboardingFormWrapper';
import { ThemeToggle } from '@/components/site/ThemeToggle';
// Feature flags removed - pre-launch, using Apple-style design by default

export default async function OnboardingPage() {
  const { userId } = await auth();
  if (!userId) {
    // Require auth for onboarding; preserve destination
    redirect('/sign-in?redirect_url=/onboarding');
  }

  // Always use Apple-style design (previously feature flagged)
  return (
    <div className='min-h-screen bg-[var(--bg)] transition-colors'>
      {/* Theme Toggle */}
      <div className='absolute top-4 right-4 z-20'>
        <ThemeToggle />
      </div>

      {/* Full-screen form without container or card */}
      <OnboardingFormWrapper
        useProgressiveForm={true}
        useMinimalistDesign={true}
        useAppleStyle={true}
      />
    </div>
  );
}
