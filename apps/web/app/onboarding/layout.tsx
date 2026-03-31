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
      <ResolvedClientProviders>
        <FeatureFlagsProvider>{children}</FeatureFlagsProvider>
      </ResolvedClientProviders>
    </>
  );
}
