export const runtime = 'nodejs';

/**
 * Waitlist layout - NO MORE REDIRECTS!
 *
 * proxy.ts already routed us here, so we know the user needs waitlist access.
 * Just render the waitlist form - no state checks, no redirects.
 */
export default async function WaitlistLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // proxy.ts already ensured user needsWaitlist
  // Just render the page - no redirects!
  return children;
}
