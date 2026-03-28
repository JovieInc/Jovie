import '../(auth)/auth-utilities.css';
import Script from 'next/script';
import { ResolvedClientProviders } from '@/components/providers/ResolvedClientProviders';
import { resolveUserState } from '@/lib/auth/gate';
import { FeatureFlagsProvider } from '@/lib/feature-flags/client';
import { getFeatureFlagsBootstrap } from '@/lib/feature-flags/server';

export const dynamic = 'force-dynamic';

export default async function OnboardingLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const authResult = await resolveUserState();
  const featureFlagsBootstrap = await getFeatureFlagsBootstrap(
    authResult.clerkUserId ?? null
  );

  return (
    <ResolvedClientProviders>
      <FeatureFlagsProvider bootstrap={featureFlagsBootstrap}>
        <Script src='/theme-init.js' strategy='beforeInteractive' />
        {children}
      </FeatureFlagsProvider>
    </ResolvedClientProviders>
  );
}
