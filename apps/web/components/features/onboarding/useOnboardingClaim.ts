'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { APP_ROUTES } from '@/constants/routes';
import { useAuthSafe } from '@/hooks/useClerkSafe';
import { track } from '@/lib/analytics';
import { ONBOARDING_FUNNEL_EVENTS } from '@/lib/onboarding/funnel-events';

/**
 * Auto-claim the anonymous onboarding conversation when the visitor
 * authenticates mid-flow (JOV-2132 PR 4).
 *
 * Fires on mount and after completed chat turns while auth reports the user
 * is signed in. Calls POST /api/onboarding/claim — the server reads the signed
 * `jovie_onboarding_session` cookie and attaches matching anonymous
 * conversations to the freshly created user.
 *
 * On success (claimed >= 1) the hook navigates to `/onboarding/checkout`
 * so the existing post-claim path takes over. If the claim returned
 * `claimed: 0` (no anonymous conversation for this session), we stay put
 * and retry after later chat activity.
 *
 * Duplicate-request guard (JOV-2203):
 * React 18+ re-runs effects whenever any dependency changes. Auth
 * state updates (`isLoaded`, `isSignedIn`) can fire the effect multiple
 * times before the first fetch resolves, causing duplicate POST calls.
 * `inflightTriggersRef` prevents a second fetch starting for the same
 * `claimTrigger` value while one is already in-flight.
 */

type ClaimStatus = 'idle' | 'pending' | 'claimed' | 'no-op' | 'error';

interface ClaimResponse {
  readonly claimed?: number;
  readonly conversationId?: string;
  readonly alreadyClaimed?: boolean;
  readonly errorCode?: string;
  readonly profile?: {
    readonly profileId: string | null;
    readonly handle: string | null;
    readonly status: 'created' | 'updated' | 'skipped';
  } | null;
}

export function useOnboardingClaim(claimTrigger = 0): ClaimStatus {
  const { isLoaded, isSignedIn } = useAuthSafe();
  const router = useRouter();
  const [status, setStatus] = useState<ClaimStatus>('idle');
  const completedTriggersRef = useRef<Set<number>>(new Set());
  const inflightTriggersRef = useRef<Set<number>>(new Set());
  const claimedRef = useRef(false);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
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

    const attemptClaim = async (): Promise<void> => {
      setStatus('pending');
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

      if (response.status === 401) {
        // The auth session expired between mount and request — bail silently.
        markTriggerCompleted();
        setStatus('error');
        return;
      }

      if (body.claimed && body.claimed > 0) {
        markTriggerCompleted();
        claimedRef.current = true;
        setStatus('claimed');
        track(ONBOARDING_FUNNEL_EVENTS.AUTH_COMPLETED, {
          surface: 'start_chat',
        });
        if (body.profile?.profileId) {
          track(ONBOARDING_FUNNEL_EVENTS.PROFILE_CREATED, {
            profile_id: body.profile.profileId,
            handle: body.profile.handle ?? undefined,
            method: 'chat_claim',
            status: body.profile.status,
          });
        }
        // Hand off to the existing /onboarding/checkout flow.
        router.replace(APP_ROUTES.ONBOARDING_CHECKOUT);
        return;
      }

      if (body.alreadyClaimed) {
        // Same user already claimed this transcript (typical retry case).
        markTriggerCompleted();
        claimedRef.current = true;
        setStatus('claimed');
        track(ONBOARDING_FUNNEL_EVENTS.AUTH_COMPLETED, {
          surface: 'start_chat',
        });
        if (body.profile?.profileId) {
          track(ONBOARDING_FUNNEL_EVENTS.PROFILE_CREATED, {
            profile_id: body.profile.profileId,
            handle: body.profile.handle ?? undefined,
            method: 'chat_claim',
            status: body.profile.status,
          });
        }
        router.replace(APP_ROUTES.ONBOARDING_CHECKOUT);
        return;
      }

      // claimed:0 → no anonymous transcript for this session. User signed
      // up but no conversation to claim. Continue on /start.
      markTriggerCompleted();
      setStatus('no-op');
    };

    void attemptClaim();

    return () => {
      cancelled = true;
    };
    // `router` is intentionally excluded from deps. useRouter() returns a
    // stable singleton in Next.js App Router — including it would cause
    // spurious effect re-runs only in test environments where the mock
    // returns a new object reference on every call. The `inflightTriggersRef`
    // guard already prevents duplicate requests if the effect does re-run.
    // The router closure value is always current for the navigate-on-claim
    // path because navigation only happens after a successful fetch response,
    // long after any router reference churn would have settled.
  }, [claimTrigger, isLoaded, isSignedIn]); // eslint-disable-line react-hooks/exhaustive-deps

  return status;
}
