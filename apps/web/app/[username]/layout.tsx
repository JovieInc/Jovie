import { ClientProviders } from '@/components/providers/ClientProviders';
import { publicEnv } from '@/lib/env-public';

// ISR: profiles are statically generated and revalidated every hour.
// On-demand invalidation via revalidateTag('profile:{username}') handles mutations.
export const revalidate = 3600;

export default function ProfileLayout({
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
