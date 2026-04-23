'use client';

import { useEffect, useState } from 'react';
import {
  consumeHomepageIntent,
  HOMEPAGE_PROMPT_HINT_TRUNCATE,
  readHomepageIntent,
  sanitizeHomepagePrompt,
} from '@/components/homepage/intent-store';

interface IntentRestorerProps {
  readonly intentId: string | undefined;
}

/**
 * Load-bearing path for post-auth prompt continuity.
 *
 * The server component passes `intent_id` from the query string. We hydrate
 * the full intent from localStorage inside `useEffect` (never during SSR —
 * storage isn't available there) and render a quiet banner. The intent is
 * consumed (deleted) immediately after display so a browser refresh doesn't
 * re-trigger the hint and adjacent flows don't accidentally pick it up.
 *
 * Failure modes are all silent:
 *   - No `intentId` query  → render nothing
 *   - storage unavailable  → render nothing (onboarding still works)
 *   - intent expired / stale / missing → render nothing
 *
 * This is advisory UX only. The onboarding grid below it is the real flow;
 * losing the hint does not break the funnel.
 */
export function IntentRestorer({ intentId }: IntentRestorerProps) {
  const [prompt, setPrompt] = useState<string | null>(null);

  useEffect(() => {
    if (!intentId) return;
    const intent = readHomepageIntent(intentId);
    if (intent) {
      setPrompt(sanitizeHomepagePrompt(intent.finalPrompt));
    }
    // Consume on first render regardless of validity — if it's stale we want
    // it cleared, and if it's valid we've already captured the prompt into
    // React state so consuming storage is safe.
    consumeHomepageIntent(intentId);
  }, [intentId]);

  if (!prompt) return null;

  const truncated =
    prompt.length > HOMEPAGE_PROMPT_HINT_TRUNCATE
      ? `${prompt.slice(0, HOMEPAGE_PROMPT_HINT_TRUNCATE)}…`
      : prompt;

  return (
    <p
      role='status'
      aria-live='polite'
      className='mb-6 text-center text-[13px] leading-[1.4] text-tertiary-token'
      title={prompt}
    >
      Continuing with &ldquo;{truncated}&rdquo;
    </p>
  );
}
