import { AuthClientProviders } from '@/components/providers/AuthClientProviders';
import { publicEnv } from '@/lib/env-public';

export default async function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const publishableKey = publicEnv.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

  return (
    <AuthClientProviders publishableKey={publishableKey}>
      <main id='main-content'>{children}</main>
    </AuthClientProviders>
  );
}
