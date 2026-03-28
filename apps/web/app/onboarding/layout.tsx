import '../(auth)/auth-utilities.css';
import Script from 'next/script';
import { ResolvedClientProviders } from '@/components/providers/ResolvedClientProviders';
import { resolveUserState } from '@/lib/auth/gate';
import { FeatureFlagsProvider } from '@/lib/feature-flags/client';

export const dynamic = 'force-dynamic';

export default async function OnboardingLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  await resolveUserState();

  return (
    <ResolvedClientProviders>
      <FeatureFlagsProvider>
        <Script src='/theme-init.js' strategy='beforeInteractive' />
        {children}
      </FeatureFlagsProvider>
    </ResolvedClientProviders>
  );
}
