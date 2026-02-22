import localFont from 'next/font/local';
import { ClerkAnalytics } from '@/components/providers/ClerkAnalytics';
import { ClientProviders } from '@/components/providers/ClientProviders';
import { publicEnv } from '@/lib/env-public';
import { FeatureFlagsProvider } from '@/lib/feature-flags/client';
import { getFeatureFlagsBootstrap } from '@/lib/feature-flags/server';

// Note: dynamic = 'force-dynamic' removed for cacheComponents compatibility
// Auth pages will still be dynamic by default

// Use local Inter font (no external network requests during build)
const inter = localFont({
  src: '../../public/fonts/Inter-Variable.woff2',
  variable: '--font-inter',
  display: 'swap',
  weight: '100 900',
});

export default async function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const publishableKey = publicEnv.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  const featureFlagsBootstrap = await getFeatureFlagsBootstrap(null);

  return (
    <ClientProviders publishableKey={publishableKey} skipCoreProviders>
      <FeatureFlagsProvider bootstrap={featureFlagsBootstrap}>
        <div className={inter.className}>
          <main id='main-content'>{children}</main>
          <ClerkAnalytics />
        </div>
      </FeatureFlagsProvider>
    </ClientProviders>
  );
}
