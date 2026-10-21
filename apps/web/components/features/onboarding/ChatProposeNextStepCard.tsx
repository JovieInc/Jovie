'use client';

// @coverage-via apps/web/tests/components/features/onboarding/ChatProposeNextStepCard.test.tsx
import { Button } from '@jovie/ui';
import { useEffect, useRef, useState } from 'react';
import { APP_ROUTES } from '@/constants/routes';
import { AuthShell } from '@/features/auth';
import { useCanRenderAuthUi, useJovieAuth } from '@/hooks/useJovieAuth';
import { track } from '@/lib/analytics';
import { ONBOARDING_FUNNEL_EVENTS } from '@/lib/onboarding/funnel-events';
import {
  OnboardingProfileRail,
  resolvePreviewArtist,
} from './OnboardingProfileRail';
import { useOnboardingProfileReview } from './OnboardingProfileReviewContext';

/**
 * Renders the `proposeNextStep` tool result inside the onboarding chat
 * (JOV-2132 PR 4).
 *
 * Three render paths driven by the deterministic decision:
 *
 *  - `instant_access` → populated profile review, then explicit Keep opens
 *    the existing Better Auth signup surface. The shell's claim hook checks
 *    the server receipt after authentication before continuing to checkout.
 *
 *  - `waitlist` → verified signup, then the claim endpoint writes the durable
 *    waitlist record. This card never renders a saved confirmation itself.
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
  const { isSignedIn } = useJovieAuth();
  const canRenderAuthUi = useCanRenderAuthUi();
  const review = useOnboardingProfileReview();
  const artist = review ? resolvePreviewArtist(review.state) : null;
  const handle = review?.state.handle;
  const reviewKey = artist && handle ? `${artist.id}:${handle}` : null;
  const [keptProfile, setKeptProfile] = useState<string | null>(null);
  const showingAuth = reviewKey !== null && keptProfile === reviewKey;
  const resumePath = handle
    ? `${APP_ROUTES.START}?${new URLSearchParams({ handle })}`
    : `${APP_ROUTES.START}?resume=1`;
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

    if (!canRenderAuthUi) {
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
      <div className='min-h-72 space-y-3 px-1 py-1'>
        <p className='mb-3 text-mid leading-7 text-primary-token'>
          Save your spot. Add a verified email to save this request and reserve
          your name and profile. You are not on the list until the confirmation
          appears.
        </p>
        <AuthShell
          mode='sign-up'
          compact
          fallbackRedirectUrl={resumePath}
          oppositeModeUrl={`${APP_ROUTES.SIGNIN}?${new URLSearchParams({ redirect_url: resumePath })}`}
          claimHandle={handle ?? undefined}
          suppressOneTap
        />
      </div>
    );
  }

  // instant_access — the moment the visitor converts.
  if (isSignedIn) {
    // The existing claim hook reports the canonical server outcome separately.
    return (
      <div className='px-1 py-1'>
        <p className='text-mid leading-7 text-primary-token'>
          {`You're already signed in. Linking this conversation to your account.`}
        </p>
      </div>
    );
  }

  return (
    <div
      className='space-y-4 px-1 py-1'
      data-testid='onboarding-profile-review'
    >
      <h2 className='text-xl font-semibold text-primary-token'>
        {reviewKey ? `Here is jov.ie/${handle}` : 'Your profile draft'}
      </h2>
      <p className='text-app leading-6 text-secondary-token'>
        Preview first. Sign in to save and verify your claim. This profile has
        not been saved to your account.
      </p>
      {review && artist ? (
        <>
          <div className='space-y-2' data-testid='onboarding-found-sources'>
            <h3 className='text-app font-medium text-primary-token'>
              What Jovie Found
            </h3>
            <p className='text-app text-secondary-token'>
              {artist.name} · @{handle}
            </p>
            {artist.latestRelease ? (
              <p className='text-app text-secondary-token'>
                Latest release: {artist.latestRelease.title}
              </p>
            ) : null}
            {review.state.socialLinks.length ? (
              <p className='text-app text-secondary-token'>
                {review.state.socialLinks.length} public{' '}
                {review.state.socialLinks.length === 1 ? 'link' : 'links'}{' '}
                included in your preview
              </p>
            ) : null}
          </div>
          <OnboardingProfileRail state={review.state} placement='inline' />
        </>
      ) : (
        <p role='status' className='text-app text-secondary-token'>
          Your preview is not ready yet. Continue in this conversation to finish
          the profile.
        </p>
      )}
      {showingAuth && canRenderAuthUi ? (
        <div className='space-y-3' data-testid='onboarding-save-auth'>
          <p className='text-app text-primary-token'>
            Continue with Google or another sign-in method to keep this profile.
          </p>
          <AuthShell
            mode='sign-up'
            compact
            fallbackRedirectUrl={resumePath}
            oppositeModeUrl={`${APP_ROUTES.SIGNIN}?${new URLSearchParams({ redirect_url: resumePath })}`}
            claimHandle={handle ?? undefined}
            suppressOneTap
          />
          <Button variant='ghost' onClick={() => setKeptProfile(null)}>
            Back To Preview
          </Button>
        </div>
      ) : (
        <div className='flex flex-wrap gap-2'>
          <Button
            disabled={!reviewKey || !canRenderAuthUi}
            onClick={() => setKeptProfile(reviewKey)}
          >
            Keep This Profile
          </Button>
          <Button
            variant='ghost'
            onClick={() => {
              setKeptProfile(null);
              review?.onEditDetails();
            }}
          >
            Edit Details
          </Button>
        </div>
      )}
      {reviewKey && !canRenderAuthUi ? (
        <p role='status' className='text-app text-secondary-token'>
          Sign-in is unavailable right now. Your preview is still here; refresh
          to try again.
        </p>
      ) : null}
    </div>
  );
}
