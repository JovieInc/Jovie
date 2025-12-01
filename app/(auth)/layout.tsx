import { ClerkAnalytics } from '@/components/providers/ClerkAnalytics';

export const dynamic = 'force-dynamic';

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
