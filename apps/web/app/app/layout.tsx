import { ClientProviders } from '@/components/providers/ClientProviders';
import { publicEnv } from '@/lib/env-public';

// Note: Cannot use 'force-static' here because Clerk auth requires dynamic request context.
// The nested (shell)/layout.tsx handles dynamic data fetching with 'force-dynamic'.

export default function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const publishableKey = publicEnv.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

  return (
    <ClientProviders publishableKey={publishableKey}>
      {children}
    </ClientProviders>
  );
}
