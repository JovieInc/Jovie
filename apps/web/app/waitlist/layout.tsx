import type { Metadata } from 'next';
import { ResolvedClientProviders } from '@/components/providers/ResolvedClientProviders';
import { NOINDEX_ROBOTS } from '@/lib/seo/noindex-metadata';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Gated access-state pages (like /signup): named in the tab, never indexed.
export const metadata: Metadata = {
  title: 'Join the waitlist',
  robots: NOINDEX_ROBOTS,
};

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
  return <ResolvedClientProviders>{children}</ResolvedClientProviders>;
}
