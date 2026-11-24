'use client';

// @coverage-via apps/web/tests/components/features/onboarding/ChatProposeNextStepCard.test.tsx
import { Button } from '@jovie/ui';
import { useEffect, useRef, useState } from 'react';
import { APP_ROUTES } from '@/constants/routes';
import { AuthShell } from '@/features/auth';
import { useAuthSafe, useCanRenderClerkUi } from '@/hooks/useClerkSafe';
import { track } from '@/lib/analytics';
import type { AudienceBand } from '@/lib/chat/tools/onboarding-signals';
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
 *  - `waitlist` → verified signup, then the claim endpoint writes the durable
 *    waitlist record. This card never renders a saved confirmation itself.
 *
 *  - `needs_more_info` → renders nothing visible. The LLM has been told to
 *    ask another sharp question; this card just acknowledges the tool was
 *    called.
 *
 * Optional post-Keep enrichment chips (ONB-21 / Keep This Draft Phase 5) sit
 * under AuthShell as subordinate, local-only controls. They never emit
 * SOCIAL_ATTACHED or restore required pre-auth social→audience.
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
  /**
   * Handle the conversation settled on. Passed to AuthShell so its
   * heading never falls back to a stale homepage `?handle=`. Waitlist
   * decisions bind `accessKind="waitlist"` (Reserve @handle); instant
   * access keeps Claim @handle (JOV-8052 / ONB-23).
   */
  readonly claimHandle?: string | null;
}

type EnrichmentPanel = 'social' | 'audience' | null;
type SocialPlatformNote = 'instagram' | 'tiktok';

const AUDIENCE_BAND_OPTIONS: ReadonlyArray<{
  readonly band: AudienceBand;
  readonly caption: string;
}> = [
  { band: 'under_500', caption: 'Under 500' },
  { band: '500_to_5k', caption: '500 To 5k' },
  { band: '5k_to_50k', caption: '5k To 50k' },
  { band: '50k_to_500k', caption: '50k To 500k' },
  { band: 'over_500k', caption: '500k+' },
];

/**
 * Subordinate optional chips under Sign up to keep. Local session state only —
 * never advances the guarded onboarding rail. Kept in this module so Phase 5
 * does not introduce a new certificate-tracked component surface.
 */
function PostKeepEnrichmentChips() {
  const [openPanel, setOpenPanel] = useState<EnrichmentPanel>(null);
  const [savedPlatform, setSavedPlatform] = useState<SocialPlatformNote | null>(
    null
  );
  const [savedBand, setSavedBand] = useState<AudienceBand | null>(null);

  return (
    <div
      className='mt-4 border-t border-subtle/60 pt-3'
      data-testid='onboarding-post-keep-enrichment'
    >
      <p className='text-2xs leading-5 text-tertiary-token'>
        Optional — does not change signup
      </p>
      <div className='mt-2 flex flex-wrap gap-2'>
        <Button
          type='button'
          variant='ghost'
          size='sm'
          data-testid='onboarding-enrichment-social-chip'
          aria-expanded={openPanel === 'social'}
          aria-pressed={savedPlatform !== null}
          onClick={() =>
            setOpenPanel(current => (current === 'social' ? null : 'social'))
          }
        >
          {savedPlatform
            ? 'Instagram / TikTok Noted'
            : 'Add Instagram / TikTok'}
        </Button>
        <Button
          type='button'
          variant='ghost'
          size='sm'
          data-testid='onboarding-enrichment-audience-chip'
          aria-expanded={openPanel === 'audience'}
          aria-pressed={savedBand !== null}
          onClick={() =>
            setOpenPanel(current =>
              current === 'audience' ? null : 'audience'
            )
          }
        >
          {savedBand ? 'Audience Noted' : 'Share Audience Size'}
        </Button>
      </div>

      {openPanel === 'social' ? (
        <fieldset
          className='mt-3 space-y-2 border-0 p-0'
          data-testid='onboarding-enrichment-social-panel'
        >
          <legend className='text-xs leading-5 text-secondary-token'>
            We will ask for the link after you sign up.
          </legend>
          <div className='flex flex-wrap gap-2'>
            <Button
              type='button'
              variant='ghost'
              size='sm'
              data-testid='onboarding-enrichment-social-instagram'
              aria-pressed={savedPlatform === 'instagram'}
              onClick={() => {
                setSavedPlatform('instagram');
                setOpenPanel(null);
              }}
            >
              Instagram
            </Button>
            <Button
              type='button'
              variant='ghost'
              size='sm'
              data-testid='onboarding-enrichment-social-tiktok'
              aria-pressed={savedPlatform === 'tiktok'}
              onClick={() => {
                setSavedPlatform('tiktok');
                setOpenPanel(null);
              }}
            >
              TikTok
            </Button>
          </div>
        </fieldset>
      ) : null}

      {openPanel === 'audience' ? (
        <fieldset
          className='mt-3 space-y-2 border-0 p-0'
          data-testid='onboarding-enrichment-audience-panel'
        >
          <legend className='text-xs leading-5 text-secondary-token'>
            Optional — we will use this after you sign up.
          </legend>
          <div className='flex flex-wrap gap-2'>
            {AUDIENCE_BAND_OPTIONS.map(option => (
              <Button
                key={option.band}
                type='button'
                variant='ghost'
                size='sm'
                data-testid={`onboarding-enrichment-audience-${option.band}`}
                aria-pressed={savedBand === option.band}
                onClick={() => {
                  setSavedBand(option.band);
                  setOpenPanel(null);
                }}
              >
                {option.caption}
              </Button>
            ))}
          </div>
        </fieldset>
      ) : null}
    </div>
  );
}

export function ChatProposeNextStepCard({
  payload,
  claimHandle,
}: ChatProposeNextStepCardProps) {
  const { isSignedIn } = useAuthSafe();
  const canRenderClerkUi = useCanRenderClerkUi();
  const kind = payload.decision.kind;
  const decisionTrackedRef = useRef(false);
  const saveStartedTrackedRef = useRef(false);

  useEffect(() => {
    if (kind === 'instant_access') {
      track(ONBOARDING_FUNNEL_EVENTS.QUALIFIED, {
        score: payload.decision.score,
        surface: 'start_chat',
      });
    }

    if (kind === 'waitlist' && !decisionTrackedRef.current) {
      decisionTrackedRef.current = true;
      track(ONBOARDING_FUNNEL_EVENTS.WAITLIST_DECISION_RENDERED, {
        score: payload.decision.score,
        surface: 'start_chat',
      });
    }
  }, [kind, payload.decision.score]);

  useEffect(() => {
    if (kind === 'waitlist' && isSignedIn && !saveStartedTrackedRef.current) {
      saveStartedTrackedRef.current = true;
      track(ONBOARDING_FUNNEL_EVENTS.WAITLIST_SAVE_STARTED, {
        score: payload.decision.score,
        surface: 'start_chat',
      });
    }
  }, [isSignedIn, kind, payload.decision.score]);

  // Memoise the auth surface so the inline form looks at home on the
  // dark onboarding canvas. AuthShell's `compact` mode renders the
  // provider grid + email OTP form without the full-page chrome.

  if (kind === 'needs_more_info') {
    // No visible card — the LLM keeps the conversation going.
    return null;
  }

  if (kind === 'waitlist') {
    if (isSignedIn) {
      return (
        <div className='min-h-72 px-1 py-1'>
          <p className='text-mid leading-7 text-primary-token'>
            Saving your request and reserving your name and profile now. Keep
            this page open until the receipt appears.
          </p>
        </div>
      );
    }

    if (!canRenderClerkUi) {
      return (
        <div className='min-h-72 px-1 py-1'>
          <p className='text-mid leading-7 text-primary-token'>
            Save your spot. Add a verified email to save this request and
            reserve your name and profile. You are not on the list until the
            confirmation appears.
          </p>
        </div>
      );
    }

    return (
      <div className='min-h-72 space-y-3 px-1 py-1' data-onboarding-auth-anchor>
        <p className='mb-3 text-mid leading-7 text-primary-token'>
          Save your spot. Add a verified email to save this request and reserve
          your name and profile. You are not on the list until the confirmation
          appears.
        </p>
        <AuthShell
          mode='sign-up'
          compact
          claimHandle={claimHandle ?? undefined}
          accessKind='waitlist'
          fallbackRedirectUrl={APP_ROUTES.START}
        />
        <PostKeepEnrichmentChips />
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
    <div className='space-y-3 px-1 py-1' data-onboarding-auth-anchor>
      <p className='mb-3 text-mid leading-7 text-primary-token'>
        {`You're in. Add an email to save your profile and this conversation.`}
      </p>
      <AuthShell
        mode='sign-up'
        compact
        claimHandle={claimHandle ?? undefined}
        fallbackRedirectUrl={APP_ROUTES.START}
      />
      <PostKeepEnrichmentChips />
    </div>
  );
}
