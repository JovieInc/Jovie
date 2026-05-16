import { ProfileWebVitalsReporter } from '@/components/features/profile/ProfileWebVitalsReporter';
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
  // JOV-2268: public profile pages are unauthenticated by design. Bypassing
  // Clerk on this route avoids loading ~400KB of clerk.browser.js for every
  // anonymous visitor — the single client-side Clerk consumer in this subtree
  // (ProfileInlineNotificationsCTA → useUserSafe) degrades gracefully to
  // `user: null` when Clerk is bypassed. Authenticated flows (sign-in, claim,
  // dashboard) run under their own route groups which mount ClerkProvider.
  return (
    <ClientProviders
      forceBypassClerk
      publishableKey={publicEnv.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY}
      skipCoreProviders
    >
      {children}
      <ProfileWebVitalsReporter />
    </ClientProviders>
  );
}
