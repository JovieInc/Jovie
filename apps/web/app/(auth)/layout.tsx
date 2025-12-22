import { ClerkAnalytics } from '@/components/providers/ClerkAnalytics';

// Note: dynamic = 'force-dynamic' removed for cacheComponents compatibility
// Auth pages will still be dynamic by default

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {children}
      <ClerkAnalytics />
    </>
  );
}
