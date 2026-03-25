import { redirect } from 'next/navigation';

/**
 * Waitlist gate is permanently disabled — all signups go straight to onboarding.
 * This page exists as a server-side redirect for bookmarks, stale caches, and
 * CTA links that still point to /waitlist.
 *
 * The waitlist infrastructure (DB tables, API routes, admin tools) is preserved
 * for future demand control. To re-enable, restore isWaitlistGateEnabled() in
 * lib/waitlist/settings.ts and restore this page from git history.
 */
export default function WaitlistPage() {
  redirect('/onboarding');
}
