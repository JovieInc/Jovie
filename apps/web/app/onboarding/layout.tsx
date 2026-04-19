import '../(auth)/auth-utilities.css';
import { ResolvedClientProviders } from '@/components/providers/ResolvedClientProviders';
import { resolveUserState } from '@/lib/auth/gate';
import { AppFlagProvider } from '@/lib/flags/client';
import { getAppFlagsSnapshot } from '@/lib/flags/server';

export const dynamic = 'force-dynamic';

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
