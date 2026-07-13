'use client';

import { useEffect } from 'react';
import { APP_ROUTES } from '@/constants/routes';
import { AuthShell } from '@/features/auth';
import { useAuthSafe, useCanRenderClerkUi } from '@/hooks/useClerkSafe';
import { track } from '@/lib/analytics';
import { ONBOARDING_FUNNEL_EVENTS } from '@/lib/onboarding/funnel-events';

/**
 * Renders the `proposeNextStep` tool result inside the onboarding chat
 * (JOV-2132 PR 4).
 *
 * Three render paths driven by the deterministic decision:
 *
 *  - `instant_access` → inline `AuthShell mode="sign-up"` (Better Auth-backed
 *    signup surface). The OnboardingShell's auto-claim hook then attaches the
 *    fresh user's account to the anonymous transcript and bounces them
 *    forward to /onboarding/checkout. (Clerk → Better Auth migration,
 *    client-flip commit ⑦: replaced Clerk `<SignUp />` prebuilt with the
 *    BA-backed `AuthShell`.)
 *
 *  - `waitlist` → confirmation message. Visitor's transcript is already
 *    saved; we'll email them when they're up.
 *
 *  - `needs_more_info` → renders nothing visible. The LLM has been told to
 *    ask another sharp question; this card just acknowledges the tool was
 *    called.
 */

export interface NextStepCardPayload {
  readonly action: 'propose_next_step';
  readonly decision: {
    readonly kind: 'instant_access' | 'waitlist' | 'needs_more_info';
    readonly rationale: string;
    readonly score: number;
  };
}

interface ChatProposeNextStepCardProps {
  readonly payload: NextStepCardPayload;
}

export function ChatProposeNextStepCard({
  payload,
}: ChatProposeNextStepCardProps) {
  const { isSignedIn } = useAuthSafe();
  const canRenderClerkUi = useCanRenderClerkUi();
  const kind = payload.decision.kind;

  useEffect(() => {
    if (kind === 'instant_access') {
      track(ONBOARDING_FUNNEL_EVENTS.QUALIFIED, {
        score: payload.decision.score,
        surface: 'start_chat',
      });
    }

    if (kind === 'waitlist') {
      track(ONBOARDING_FUNNEL_EVENTS.WAITLISTED, {
        score: payload.decision.score,
        surface: 'start_chat',
      });
    }
  }, [kind, payload.decision.score]);

  // Memoise the auth surface so the inline form looks at home on the
  // dark onboarding canvas. AuthShell's `compact` mode renders the
  // provider grid + email OTP form without the full-page chrome.

  if (kind === 'needs_more_info') {
    // No visible card — the LLM keeps the conversation going.
    return null;
  }

  if (kind === 'waitlist') {
    return (
      <div className='px-1 py-1'>
        <p className='text-mid leading-7 text-primary-token'>
          {`You're on the list. I'll email you when you're up. We can pick up right here.`}
        </p>
      </div>
    );
  }

  // instant_access — the moment the visitor converts.
  if (isSignedIn) {
    // Already authenticated mid-conversation (rare but possible if the user
    // had a Clerk session already). Skip the form; the claim hook on the
    // shell will fire and bounce them to checkout.
    return (
      <div className='px-1 py-1'>
        <p className='text-mid leading-7 text-primary-token'>
          {`You're already signed in. Linking this conversation to your account.`}
        </p>
      </div>
    );
  }

  if (!canRenderClerkUi) {
    return (
      <div className='px-1 py-1'>
        <p className='text-mid leading-7 text-primary-token'>
          {`You're in. Create your account to keep this conversation and finish your profile.`}
        </p>
      </div>
    );
  }

  return (
    <div className='space-y-3 px-1 py-1'>
      <p className='mb-3 text-mid leading-7 text-primary-token'>
        {`You're in. Add an email to keep going. I'll save this conversation to your account so we don't lose it.`}
      </p>
      <AuthShell
        mode='sign-up'
        compact
        fallbackRedirectUrl={APP_ROUTES.START}
      />
    </div>
  );
}
