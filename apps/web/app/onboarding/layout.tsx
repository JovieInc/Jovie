import '../(auth)/auth-utilities.css';
import Script from 'next/script';
import { ClientProviders } from '@/components/providers/ClientProviders';
import { resolveUserState } from '@/lib/auth/gate';
import { resolvePublishableKeyFromHeaders } from '@/lib/auth/staging-clerk-keys';
import { FeatureFlagsProvider } from '@/lib/feature-flags/client';

export const dynamic = 'force-dynamic';

export default async function OnboardingLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const publishableKey = await resolvePublishableKeyFromHeaders();
  await resolveUserState();

  return (
    <ClientProviders publishableKey={publishableKey}>
      <FeatureFlagsProvider>
        <Script src='/theme-init.js' strategy='beforeInteractive' />
        {children}
      </FeatureFlagsProvider>
    </ClientProviders>
  );
}
