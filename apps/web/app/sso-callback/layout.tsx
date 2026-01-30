import { ClientProviders } from '@/components/providers/ClientProviders';
import { publicEnv } from '@/lib/env-public';

export default function SsoCallbackLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const publishableKey = publicEnv.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

  return (
    <ClientProviders publishableKey={publishableKey} skipCoreProviders>
      {children}
    </ClientProviders>
  );
}
