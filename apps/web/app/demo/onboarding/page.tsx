import type { Metadata } from 'next';
import { Suspense } from 'react';
import { OnboardingDemoExperience } from '@/features/demo/OnboardingDemoExperience';

export const metadata: Metadata = {
  title: 'Jovie - Onboarding Demo',
};

export const revalidate = false;

export default function OnboardingDemoPage() {
  return (
    <Suspense fallback={null}>
      <OnboardingDemoExperience />
    </Suspense>
  );
}
