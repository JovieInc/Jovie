import type { Metadata } from 'next';
import { ResolvedClientProviders } from '@/components/providers/ResolvedClientProviders';
import { AppFlagProvider } from '@/lib/flags/client';
import { getAppFlagsSnapshot } from '@/lib/flags/server';

export const dynamic = 'force-dynamic';

// Legacy onboarding URLs redirect to /start; checkout remains under this route
// group and handles its own auth gating.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function OnboardingLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const initialFlags = await getAppFlagsSnapshot();

  return (
    <ResolvedClientProviders>
      <AppFlagProvider initialFlags={initialFlags}>{children}</AppFlagProvider>
    </ResolvedClientProviders>
  );
}
