import { ClientProviders } from '@/components/providers/ClientProviders';
import { publicEnv } from '@/lib/env-public';

export const runtime = 'nodejs';
// Force dynamic rendering — waitlist uses Clerk and cannot be pre-rendered
export const dynamic = 'force-dynamic';

/**
 * Waitlist layout - NO MORE REDIRECTS!
 *
 * proxy.ts already routed us here, so we know the user needs waitlist access.
 * Just render the waitlist form - no state checks, no redirects.
 */
export default async function WaitlistLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // proxy.ts already ensured user needsWaitlist
  // Just render the page - no redirects!
  const publishableKey = publicEnv.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

  return (
    <ClientProviders publishableKey={publishableKey} skipCoreProviders>
      {children}
    </ClientProviders>
  );
}
