import '../(auth)/auth-utilities.css';
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
    <>
      {/* eslint-disable-next-line @next/next/no-sync-scripts -- next/script injects a nonce mismatch here during hydration */}
      <script src='/theme-init.js' />
      <ResolvedClientProviders>
        <FeatureFlagsProvider>{children}</FeatureFlagsProvider>
      </ResolvedClientProviders>
    </>
  );
}
