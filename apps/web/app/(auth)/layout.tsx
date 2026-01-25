import localFont from 'next/font/local';
import { ClerkAnalytics } from '@/components/providers/ClerkAnalytics';
import { ClientProviders } from '@/components/providers/ClientProviders';
import { publicEnv } from '@/lib/env-public';

// Note: dynamic = 'force-dynamic' removed for cacheComponents compatibility
// Auth pages will still be dynamic by default

// Use local Inter font (no external network requests during build)
const inter = localFont({
  src: '../../public/fonts/Inter-Variable.woff2',
  variable: '--font-inter',
  display: 'swap',
  weight: '100 900',
});

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const publishableKey = publicEnv.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

  return (
    <ClientProviders publishableKey={publishableKey} skipCoreProviders>
      <div className={inter.className}>
        {children}
        <ClerkAnalytics />
      </div>
    </ClientProviders>
  );
}
