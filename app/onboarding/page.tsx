import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { OnboardingFormWrapper } from '@/components/dashboard/organisms/OnboardingFormWrapper';
import { ThemeToggle } from '@/components/site/ThemeToggle';

export default async function OnboardingPage() {
  const { userId } = await auth();
  if (!userId) {
    // Require auth for onboarding; preserve destination
    redirect('/signin?redirect_url=/onboarding');
  }

  return (
    <div className='min-h-screen bg-[var(--bg)] transition-colors'>
      {/* Theme Toggle */}
      <div className='absolute top-4 right-4 z-20'>
        <ThemeToggle />
      </div>

      {/* Unified onboarding form */}
      <OnboardingFormWrapper />
    </div>
  );
}
