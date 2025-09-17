import { ClerkAnalytics } from '@/components/providers/ClerkAnalytics';

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
