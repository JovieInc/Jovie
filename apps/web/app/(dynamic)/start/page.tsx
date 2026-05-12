import type { Metadata } from 'next';
import { OnboardingShell } from '@/components/features/onboarding/OnboardingShell';
import { getOrMintOnboardingSessionId } from '@/lib/onboarding/session';

/**
 * Anonymous onboarding chat entry point (JOV-2132 PR 3).
 *
 * Pre-account musicians land here. The server component ensures an
 * `jovie_onboarding_session` cookie is minted (signed; PR 1 helper) before
 * the client OnboardingChat opens its first POST to /api/chat in
 * `mode='onboarding'`.
 *
 * Placed under `app/(dynamic)/` so the marketing-static rule does not apply
 * — this route mints session cookies per request and dispatches a streaming
 * LLM response. CSP nonce and middleware behavior follow the existing
 * dynamic-group conventions.
 *
 * The visual shell here is intentionally minimal for v1. Cinematic reveal
 * choreography (per the JOV-2132 plan + Stanley refs) lands incrementally
 * after the first round of real-artist watch sessions.
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Start with Jovie',
  description: 'Set up your Jovie artist profile in one conversation.',
  robots: { index: false, follow: false },
};

export default async function StartPage() {
  // Mint or read the signed onboarding session cookie. The /api/chat handler
  // will read this cookie on the first message; persisting it here means the
  // first POST already has a stable session id and Turnstile gate behavior.
  const { sessionId } = await getOrMintOnboardingSessionId();

  // We expose only the leading 8 chars of the session id to the client for
  // debugging breadcrumbs — the full signed cookie value is httpOnly, the
  // client never needs the full id, and we keep it scrubbed in any Sentry
  // crumbs that mention it.
  const sessionLabel = sessionId.slice(0, 8);

  return <OnboardingShell sessionLabel={sessionLabel} />;
}
