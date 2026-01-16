import { Inter } from 'next/font/google';
import { ClerkAnalytics } from '@/components/providers/ClerkAnalytics';

// Note: dynamic = 'force-dynamic' removed for cacheComponents compatibility
// Auth pages will still be dynamic by default

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className={inter.className}>
      {children}
      <ClerkAnalytics />
    </div>
  );
}
