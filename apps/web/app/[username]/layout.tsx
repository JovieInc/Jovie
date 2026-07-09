import { ProfileWebVitalsReporter } from '@/components/features/profile/ProfileWebVitalsReporter';
import { ClientProviders } from '@/components/providers/ClientProviders';

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
  // JOV-2268: public profile pages are unauthenticated by design. Bypassing
  // Clerk on this route avoids loading ~400KB of clerk.browser.js for every
  // anonymous visitor — the single client-side Clerk consumer in this subtree
  // (ProfileInlineNotificationsCTA → useUserSafe) degrades gracefully to
  // `user: null` when Clerk is bypassed. Authenticated flows (sign-in, claim,
  // dashboard) run under their own route groups which mount ClerkProvider.
  return (
    <ClientProviders forceBypassClerk skipCoreProviders>
      {children}
      <ProfileWebVitalsReporter />
    </ClientProviders>
  );
}
