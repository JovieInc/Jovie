import { Inter } from 'next/font/google';
import { ClerkAnalytics } from '@/components/providers/ClerkAnalytics';
import { ClientProviders } from '@/components/providers/ClientProviders';
import { publicEnv } from '@/lib/env-public';

// Note: dynamic = 'force-dynamic' removed for cacheComponents compatibility
// Auth pages will still be dynamic by default

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

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
