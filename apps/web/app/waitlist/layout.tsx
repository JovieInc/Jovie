import '../(auth)/auth-utilities.css';
import Script from 'next/script';
import { ResolvedClientProviders } from '@/components/providers/ResolvedClientProviders';

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
  return (
    <>
      <Script src='/theme-init.js' strategy='beforeInteractive' />
      <ResolvedClientProviders>{children}</ResolvedClientProviders>
    </>
  );
}
