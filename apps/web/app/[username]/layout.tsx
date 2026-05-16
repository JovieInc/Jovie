import { ProfileWebVitalsReporter } from '@/components/features/profile/ProfileWebVitalsReporter';
import { ClientProviders } from '@/components/providers/ClientProviders';
import { publicEnv } from '@/lib/env-public';

// ISR: profiles are statically generated and revalidated every hour.
// On-demand invalidation via revalidateTag(createProfileTag(username))
// + revalidatePath(`/${username}`) handles mutations — both fired from
// `lib/cache/profile.ts::invalidateProfileCache()`, called after every
// profile/social-link/avatar mutation from the dashboard.
//
// Cache layers (JOV-2270 investigation):
//   1. Server-side Full Route Cache (ISR): 3600s, busted on mutation
//      via revalidatePath() and revalidateTag(createProfileTag()).
//   2. Browser-side Router Cache (RSC): governed by next.config.js
//      `experimental.staleTimes.static: 300` (5 min). Independent of
//      revalidateTag — auto-expires per-browser. Worst-case staleness on
//      SPA navigation between profile pages is 5 minutes; this is
//      acceptable for public profile content and matches the Next 15
//      default for static-classified routes. A profile update is
//      reflected within 5 min on the same browser session.
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
      <ProfileWebVitalsReporter />
    </ClientProviders>
  );
}
