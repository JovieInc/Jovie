'use client';

import { useEffect, useRef, useState } from 'react';
import { useAuthSafe } from '@/hooks/useClerkSafe';
import { track } from '@/lib/analytics';
import {
  markSignupFirstValuePending,
  trackFunnelStep,
} from '@/lib/analytics/signup-funnel-client';
import { ONBOARDING_FUNNEL_EVENTS } from '@/lib/onboarding/funnel-events';
import { hasOnboardingConversionSurfaceShown } from './OnboardingChat';

/**
 * Claim the anonymous onboarding conversation when the visitor
 * authenticates mid-flow (JOV-2132 PR 4).
 *
 * Fires when a visitor who rendered signed-out signs in, and after completed
 * chat turns while signed in. A visitor whose FIRST rendered auth state is
 * already signed in never auto-fires on mount (JOV-8068): they arrive with a
 * session, not a conversion, and the claim (plus its checkout/waitlist
 * handoff) must wait for an explicit in-chat step. Calls
 * POST /api/onboarding/claim — the server reads the signed
 * `jovie_onboarding_session` cookie and attaches matching anonymous
 * conversations to the freshly created user.
 *
 * On a durable pending receipt it reports a `waitlist` handoff; admitted
 * users get a `checkout` handoff. The hook NEVER navigates (JOV-8068): the
 * shell renders an inline handoff card and the visitor leaves `/start` only
 * by clicking it. Missing durable artist data stays in the same `/start`
 * conversation and retries after the next natural-language turn. If the
 * claim returns `claimed: 0` without an idempotent receipt, it stays put and
 * retries after later chat activity.
 *
 * Duplicate-request guard (JOV-2203):
 * React 18+ re-runs effects whenever any dependency changes. Clerk's auth
 * state updates (`isLoaded`, `isSignedIn`) can fire the effect multiple
 * times before the first fetch resolves, causing duplicate POST calls.
 * `inflightTriggersRef` prevents a second fetch starting for the same
 * `claimTrigger` value while one is already in-flight.
 */

type ClaimStatus =
  | 'idle'
  | 'pending'
  | 'claimed'
  | 'no-op'
  | 'retry-after-webhook'
  | 'identity-conflict'
  | 'error';

interface ClaimResponse {
  readonly claimed?: number;
  readonly conversationId?: string;
  readonly retryAfterWebhook?: boolean;
  readonly alreadyClaimed?: boolean;
  readonly errorCode?: string;
  readonly profileError?: { readonly errorCode: string };
  readonly waitlistIntakeRequired?: boolean;
  readonly waitlist?: {
    readonly entryId: string;
    readonly status: string;
    readonly outcome: string;
  };
  readonly profile?: {
    readonly profileId: string | null;
    readonly handle: string | null;
    readonly status: 'created' | 'updated' | 'skipped';
  } | null;
}

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1_500;

/**
 * Where the visitor goes next once their claim resolved (JOV-8068).
 * Surfaced as an inline card — navigation is always the visitor's click.
 */
export interface OnboardingClaimHandoff {
  readonly kind: 'waitlist' | 'checkout';
}

interface UseOnboardingClaimOptions {
  /** Called once when a completed claim produces a next-step handoff. */
  readonly onHandoffReady?: (handoff: OnboardingClaimHandoff) => void;
}

export function useOnboardingClaim(
  claimTrigger = 0,
  enabled = true,
  options?: UseOnboardingClaimOptions
): ClaimStatus {
  const { isLoaded, isSignedIn } = useAuthSafe();
  const [status, setStatus] = useState<ClaimStatus>('idle');
  const completedTriggersRef = useRef<Set<number>>(new Set());
  const inflightTriggersRef = useRef<Set<number>>(new Set());
  const claimedRef = useRef(false);
  // JOV-8068: true only once the hook has rendered a signed-OUT state. A
  // visitor whose first rendered auth state is already signed in never
  // auto-claims on mount — their claim must follow an explicit in-chat step.
  const sawSignedOutRef = useRef(false);
  // Deactivated claim contexts (the claim completed, was disabled mid-flight,
  // or auth dropped) never report a handoff even if their fetch resolves.
  const claimActiveRef = useRef(false);
  const onHandoffReadyRef = useRef(options?.onHandoffReady);
  onHandoffReadyRef.current = options?.onHandoffReady;

  useEffect(() => {
    if (!enabled || !isLoaded) {
      claimActiveRef.current = false;
      return;
    }
    if (!isSignedIn) {
      sawSignedOutRef.current = true;
      claimActiveRef.current = false;
      return;
    }
    // JOV-8068: a visitor whose FIRST rendered auth state is already signed
    // in never claims on mount — and never on turn activity alone. Their
    // claim is armed only once the chat has rendered the explicit conversion
    // surface (the propose-next-step / propose-checkout card). A visitor who
    // signed up mid-chat is never gated: their trigger-0 claim IS the
    // conversion.
    if (!sawSignedOutRef.current && !hasOnboardingConversionSurfaceShown()) {
      claimActiveRef.current = false;
      return;
    }
    claimActiveRef.current = true;
    if (claimedRef.current) return;
    if (completedTriggersRef.current.has(claimTrigger)) return;
    // Prevent duplicate in-flight requests for the same trigger value.
    // This guards against React re-running the effect before the fetch
    // resolves (e.g. Clerk auth state updates: isLoaded false→true, then
    // isSignedIn false→true on the same claimTrigger value).
    if (inflightTriggersRef.current.has(claimTrigger)) return;
    inflightTriggersRef.current.add(claimTrigger);

    let cancelled = false;
    const markTriggerCompleted = () => {
      completedTriggersRef.current.add(claimTrigger);
      inflightTriggersRef.current.delete(claimTrigger);
    };

    const attemptClaim = async (attempt: number): Promise<void> => {
      // Keep an unresolved ownership conflict visible while a later turn is
      // checked; an in-flight retry is not evidence the conflict cleared.
      setStatus(current =>
        current === 'identity-conflict' ? current : 'pending'
      );
      const startedAt = Date.now();
      let response: Response;
      try {
        response = await fetch('/api/onboarding/claim', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{}',
        });
      } catch {
        if (!cancelled) {
          markTriggerCompleted();
          setStatus('error');
        }
        return;
      }
      if (cancelled) return;

      let body: ClaimResponse;
      try {
        body = (await response.json()) as ClaimResponse;
      } catch {
        if (!cancelled) {
          markTriggerCompleted();
          setStatus('error');
        }
        return;
      }
      if (cancelled) return;

      if (response.status === 401 || response.status === 403) {
        // Unauthenticated or non-owner — ownership gate fails closed; no
        // reserved / locked-in / manage-as-owner success navigation.
        markTriggerCompleted();
        setStatus('error');
        return;
      }

      if (
        body.errorCode === 'SPOTIFY_IDENTITY_CONFLICT' ||
        body.profileError?.errorCode === 'SPOTIFY_IDENTITY_CONFLICT'
      ) {
        // Preserve the transcript for correction; a saved waitlist receipt is
        // not proof that its requested profile/handle was reserved.
        markTriggerCompleted();
        setStatus('identity-conflict');
        return;
      }

      if (!response.ok) {
        markTriggerCompleted();
        setStatus('error');
        trackFunnelStep({
          funnel: 'artist_signup',
          step: 'claim_complete',
          outcome: 'error',
          surface: 'onboarding',
          reason:
            body.errorCode === 'WAITLIST_SAVE_FAILED'
              ? 'waitlist_save_failed'
              : `http_${response.status}`,
        });
        if (body.errorCode === 'WAITLIST_SAVE_FAILED') {
          track(ONBOARDING_FUNNEL_EVENTS.WAITLIST_SAVE_FAILED, {
            surface: 'start_chat',
            duration_ms: Date.now() - startedAt,
            http_status: response.status,
            attempt,
          });
        }
        return;
      }

      if (body.retryAfterWebhook && attempt < MAX_RETRIES) {
        setStatus('retry-after-webhook');
        setTimeout(() => {
          if (!cancelled) void attemptClaim(attempt + 1);
        }, RETRY_DELAY_MS);
        return;
      }

      const completeClaim = () => {
        markTriggerCompleted();
        claimedRef.current = true;
        setStatus('claimed');
        track(ONBOARDING_FUNNEL_EVENTS.AUTH_COMPLETED, {
          surface: 'start_chat',
        });
        if (body.waitlist?.entryId) {
          trackFunnelStep({
            funnel: 'artist_signup',
            step: 'claim_complete',
            outcome: 'dropped',
            surface: 'onboarding',
            reason: 'waitlisted',
          });
          track(ONBOARDING_FUNNEL_EVENTS.WAITLISTED, {
            surface: 'start_chat',
            entry_id: body.waitlist.entryId,
            status: body.waitlist.status,
            outcome: body.waitlist.outcome,
            duration_ms: Date.now() - startedAt,
          });
          if (claimActiveRef.current) {
            onHandoffReadyRef.current?.({ kind: 'waitlist' });
          }
          claimActiveRef.current = false;
          return;
        }
        if (body.profile?.profileId) {
          markSignupFirstValuePending();
          track(ONBOARDING_FUNNEL_EVENTS.PROFILE_CREATED, {
            profile_id: body.profile.profileId,
            handle: body.profile.handle ?? undefined,
            method: 'chat_claim',
            status: body.profile.status,
          });
        }
        // Hand off to the existing /onboarding/checkout flow via the inline
        // card — the visitor decides when to leave /start (JOV-8068).
        if (claimActiveRef.current) {
          onHandoffReadyRef.current?.({ kind: 'checkout' });
        }
        claimActiveRef.current = false;
      };

      if (body.waitlistIntakeRequired) {
        // Missing durable artist/social identity. Stay in this /start
        // conversation and retry after the next natural-language turn.
        track(ONBOARDING_FUNNEL_EVENTS.WAITLIST_INTAKE_REQUIRED, {
          surface: 'start_chat',
          duration_ms: Date.now() - startedAt,
        });
        markTriggerCompleted();
        setStatus('no-op');
        return;
      }

      if ((body.claimed && body.claimed > 0) || body.alreadyClaimed) {
        completeClaim();
        return;
      }

      // claimed:0 → no anonymous transcript for this session. User signed
      // up but no conversation to claim. Continue on /start.
      markTriggerCompleted();
      setStatus('no-op');
    };

    void attemptClaim(1);

    return () => {
      cancelled = true;
    };
    // The handoff callback is read through a ref so callers can pass an
    // inline function without re-running the effect.
  }, [claimTrigger, enabled, isLoaded, isSignedIn]); // eslint-disable-line react-hooks/exhaustive-deps

  return status;
}
