import { ClientProviders } from '@/components/providers/ClientProviders';
import { resolvePublishableKeyFromHeaders } from '@/lib/auth/staging-clerk-keys';

export const dynamic = 'force-dynamic';

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const publishableKey = await resolvePublishableKeyFromHeaders();

  return (
    <ClientProviders publishableKey={publishableKey} skipCoreProviders>
      {children}
    </ClientProviders>
  );
}
