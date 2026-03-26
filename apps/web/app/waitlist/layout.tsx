import { ClientProviders } from '@/components/providers/ClientProviders';
import { resolvePublishableKeyFromHeaders } from '@/lib/auth/staging-clerk-keys';

export const runtime = 'nodejs';
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
  const publishableKey = await resolvePublishableKeyFromHeaders();

  return (
    <ClientProviders publishableKey={publishableKey}>
      {children}
    </ClientProviders>
  );
}
