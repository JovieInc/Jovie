import type { Metadata } from 'next';
import { OnboardingShell } from '@/components/features/onboarding/OnboardingShell';

/**
 * Canonical onboarding chat entry point.
 *
 * The page is intentionally read-only. `/api/chat` mints the signed
 * `jovie_onboarding_session` cookie on the visitor's first onboarding
 * message, because cookies can only be modified from a route handler or
 * server action.
 *
 * Placed under `app/(dynamic)/` so the marketing-static rule does not apply
 * — this route dispatches a streaming LLM response through `/api/chat`. CSP
 * nonce and middleware behavior follow the existing dynamic-group conventions.
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

export default async function StartPage(
  {
    searchParams,
  }: Readonly<{
    searchParams: Promise<Record<string, string | string[] | undefined>>;
  }> = { searchParams: Promise.resolve({}) }
) {
  const params = await searchParams;
  const intentId =
    typeof params.intent_id === 'string' ? params.intent_id : undefined;
  const starterPrompt =
    typeof params.starter_prompt === 'string'
      ? params.starter_prompt
      : undefined;

  return (
    <OnboardingShell
      intentId={intentId}
      sessionLabel='pending'
      starterPrompt={starterPrompt}
    />
  );
}
