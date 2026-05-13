import type { Metadata } from 'next';
import { ResolvedClientProviders } from '@/components/providers/ResolvedClientProviders';
import { AppFlagProvider } from '@/lib/flags/client';
import { getAppFlagsSnapshot } from '@/lib/flags/server';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function StartLayout({
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
