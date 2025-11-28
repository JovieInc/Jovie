import { ClerkAnalytics } from '@/components/providers/ClerkAnalytics';
import { ClerkAppProvider } from '@/components/providers/ClerkAppProvider';

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkAppProvider>
      {children}
      <ClerkAnalytics />
    </ClerkAppProvider>
  );
}
