import '../(auth)/auth-utilities.css';
import type { Metadata } from 'next';
import { ResolvedClientProviders } from '@/components/providers/ResolvedClientProviders';
import { resolveUserState } from '@/lib/auth/gate';
import { AppFlagProvider } from '@/lib/flags/client';
import { getAppFlagsSnapshot } from '@/lib/flags/server';

export const dynamic = 'force-dynamic';

// Onboarding is authed-only — never index, and crawlers can't reach it anyway.
// Explicit noindex prevents accidental surfacing if robots.txt or auth gates change.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function OnboardingLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  await resolveUserState();
  const initialFlags = await getAppFlagsSnapshot();

  return (
    <ResolvedClientProviders>
      <AppFlagProvider initialFlags={initialFlags}>{children}</AppFlagProvider>
    </ResolvedClientProviders>
  );
}
