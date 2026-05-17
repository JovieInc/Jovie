'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AuthModalShell } from '@/components/auth/AuthModalShell';
import { AuthShell } from '@/components/features/auth/AuthShell';
import {
  HOMEPAGE_PROMPT_HINT_TRUNCATE,
  readHomepageIntent,
} from '@/components/homepage/intent-store';
import { APP_ROUTES } from '@/constants/routes';
import { buildAuthRouteUrl } from '@/lib/auth/build-auth-route-url';

/**
 * Intercepted signup modal.
 *
 * Activates on desktop (>=768px) when `router.push('/signup?...')` is called
 * from a same-origin page. Renders the canonical AuthShell inside our shared
 * modal shell so the modal and the full-page route share the exact same
 * content model, links, and provider list (JOV-2064).
 *
 * Dismissal (via shell): Escape, backdrop click, or browser-back.
 * Refresh on /signup renders the full-page /signup instead (intercepts
 * don't survive reload).
 */
export function SignupModalClient() {
  const searchParams = useSearchParams();
  const [promptHint, setPromptHint] = useState<string | null>(null);

  // Hydrate the intent hint from localStorage (text only - the load-bearing
  // restoration happens on /onboarding after the OAuth round-trip).
  useEffect(() => {
    // `intent_id` travels inside the encoded `redirect_url` (so it survives
    // Clerk's OAuth round-trip), not as a sibling query param on /signup.
    // Parse it out of redirect_url's own query string.
    const redirectUrlRaw = searchParams.get('redirect_url');
    if (!redirectUrlRaw) return;
    let intentId: string | null = null;
    try {
      intentId = new URL(
        redirectUrlRaw,
        globalThis.window?.location.origin ?? 'http://localhost'
      ).searchParams.get('intent_id');
    } catch {
      return;
    }
    if (!intentId) return;
    const intent = readHomepageIntent(intentId);
    if (intent) setPromptHint(intent.finalPrompt);
  }, [searchParams]);

  const signInUrl = buildAuthRouteUrl(APP_ROUTES.SIGNIN, searchParams);
  const redirectUrl = searchParams.get('redirect_url') ?? APP_ROUTES.WAITLIST;

  const statusRow = promptHint ? (
    <p aria-live='polite' className='truncate' title={promptHint}>
      Continuing with &ldquo;
      {promptHint.length > HOMEPAGE_PROMPT_HINT_TRUNCATE
        ? `${promptHint.slice(0, HOMEPAGE_PROMPT_HINT_TRUNCATE)}...`
        : promptHint}
      &rdquo;
    </p>
  ) : null;

  return (
    <AuthModalShell
      ariaLabel='Request access to Jovie'
      statusRow={statusRow}
      backButtonLabel={promptHint ? 'Back to chat' : 'Go back'}
    >
      <AuthShell
        mode='sign-up'
        compact
        oppositeModeUrl={signInUrl}
        fallbackRedirectUrl={redirectUrl}
      />
    </AuthModalShell>
  );
}
