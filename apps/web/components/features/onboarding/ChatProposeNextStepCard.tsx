'use client';

import { SignUp } from '@clerk/nextjs';
import { useEffect, useMemo } from 'react';
import { APP_ROUTES } from '@/constants/routes';
import { useAuthSafe, useCanRenderClerkUi } from '@/hooks/useClerkSafe';
import { track } from '@/lib/analytics';
import { ONBOARDING_FUNNEL_EVENTS } from '@/lib/onboarding/funnel-events';

/**
 * Renders the `proposeNextStep` tool result inside the onboarding chat
 * (JOV-2132 PR 4).
 *
 * Three render paths driven by the deterministic decision:
 *
 *  - `instant_access` → inline Clerk `<SignUp />` with `fallbackRedirectUrl`
 *    back to /start. The OnboardingShell's auto-claim hook then attaches the
 *    fresh user's account to the anonymous transcript and bounces them
 *    forward to /onboarding/checkout.
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

  // Memoise the Clerk appearance so the inline form looks at home on the
  // dark onboarding canvas without re-creating the object on every render.
  const appearance = useMemo(
    () => ({
      elements: {
        rootBox: 'w-full',
        card: 'bg-transparent shadow-none border-0 p-0',
        headerTitle: 'text-primary-token text-[18px] font-semibold',
        headerSubtitle: 'text-secondary-token text-[13px]',
        formButtonPrimary:
          'bg-white text-black hover:bg-white/90 font-semibold',
        socialButtonsBlockButton:
          'bg-surface-1 border-subtle text-primary-token hover:bg-surface-2',
        formFieldInput:
          'bg-surface-0 border-subtle text-primary-token focus:border-primary-token/30',
        formFieldLabel: 'text-secondary-token',
        footer: 'hidden',
        dividerLine: 'bg-(--linear-border-subtle)',
        dividerText: 'text-tertiary-token',
      },
      variables: {
        colorBackground: 'transparent',
        colorPrimary: '#ffffff',
        colorText: '#ffffff',
        colorTextSecondary: 'rgba(255,255,255,0.6)',
        colorInputBackground: 'rgba(255,255,255,0.04)',
        colorInputText: '#ffffff',
        borderRadius: '12px',
      },
    }),
    []
  );

  if (kind === 'needs_more_info') {
    // No visible card — the LLM keeps the conversation going.
    return null;
  }

  if (kind === 'waitlist') {
    return (
      <div className='rounded-xl border border-subtle bg-surface-1 px-4 py-3'>
        <p className='text-[15px] leading-7 text-primary-token'>
          {`You're on the list. I'll email you when you're up — we can pick up right here.`}
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
      <div className='rounded-xl border border-subtle bg-surface-1 px-4 py-3'>
        <p className='text-[15px] leading-7 text-primary-token'>
          {`You're already signed in. Linking this conversation to your account…`}
        </p>
      </div>
    );
  }

  if (!canRenderClerkUi) {
    return (
      <div className='rounded-xl border border-subtle bg-surface-1 px-4 py-3'>
        <p className='text-[15px] leading-7 text-primary-token'>
          {`You're in. Use the dev toolbar to continue as a local test user — I'll keep this conversation ready to link.`}
        </p>
      </div>
    );
  }

  return (
    <div className='rounded-xl border border-subtle bg-surface-1 px-4 py-4'>
      <p className='mb-3 text-[15px] leading-7 text-primary-token'>
        {`You're in. Add an email to keep going — I'll save this conversation to your account so we don't lose it.`}
      </p>
      <SignUp
        routing='hash'
        oauthFlow='redirect'
        signInUrl={APP_ROUTES.SIGNIN}
        fallbackRedirectUrl={APP_ROUTES.START}
        appearance={appearance}
      />
    </div>
  );
}
