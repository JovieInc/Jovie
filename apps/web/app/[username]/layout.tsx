import { ClientProviders } from '@/components/providers/ClientProviders';
import { publicEnv } from '@/lib/env-public';

// ISR: profiles are statically generated and revalidated every hour.
// On-demand invalidation via revalidateTag('profile:{username}') handles mutations.
export const revalidate = 3600;

export default function ProfileLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const shouldBypassClerkForPublicProfiles =
    process.env.NODE_ENV === 'test' ||
    process.env.VERCEL_ENV === 'preview' ||
    publicEnv.NEXT_PUBLIC_E2E_MODE === '1' ||
    publicEnv.NEXT_PUBLIC_CLERK_MOCK === '1';

  return (
    <ClientProviders
      forceBypassClerk={shouldBypassClerkForPublicProfiles}
      // Preview/test profile runs can hit Clerk origin/handshake issues.
      // Keep the bypass scoped there so production /[username] routes still
      // expose real Clerk context for authenticated profile UI.
      publishableKey={publicEnv.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY}
      skipCoreProviders
    >
      {children}
    </ClientProviders>
  );
}
