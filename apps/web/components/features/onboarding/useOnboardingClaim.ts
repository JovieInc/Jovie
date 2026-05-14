'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { APP_ROUTES } from '@/constants/routes';
import { useAuthSafe } from '@/hooks/useClerkSafe';

/**
 * Auto-claim the anonymous onboarding conversation when the visitor
 * authenticates mid-flow (JOV-2132 PR 4).
 *
 * Fires on mount and after completed chat turns while Clerk reports the user
 * is signed in. Calls POST /api/onboarding/claim — the server reads the signed
 * `jovie_onboarding_session` cookie and attaches matching anonymous
 * conversations to the freshly created user.
 *
 * Handles the Clerk → DB user-mirror race: the claim endpoint returns
 * `{ retryAfterWebhook: true }` when Clerk has authenticated the user but
 * the Clerk webhook hasn't yet written them into our `users` table. We
 * retry up to 3 times with a 1.5s gap before giving up — the webhook
 * almost always lands in under 2s.
 *
 * On success (claimed >= 1) the hook navigates to `/onboarding/checkout`
 * so the existing post-claim path takes over. If the claim returned
 * `claimed: 0` (no anonymous conversation for this session), we stay put
 * and retry after later chat activity.
 */

type ClaimStatus =
  | 'idle'
  | 'pending'
  | 'claimed'
  | 'no-op'
  | 'retry-after-webhook'
  | 'error';

interface ClaimResponse {
  readonly claimed?: number;
  readonly conversationId?: string;
  readonly retryAfterWebhook?: boolean;
  readonly alreadyClaimed?: boolean;
  readonly errorCode?: string;
}

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1_500;

export function useOnboardingClaim(claimTrigger = 0): ClaimStatus {
  const { isLoaded, isSignedIn } = useAuthSafe();
  const router = useRouter();
  const [status, setStatus] = useState<ClaimStatus>('idle');
  const completedTriggersRef = useRef<Set<number>>(new Set());
  const claimedRef = useRef(false);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    if (claimedRef.current) return;
    if (completedTriggersRef.current.has(claimTrigger)) return;

    let cancelled = false;
    const markTriggerCompleted = () => {
      completedTriggersRef.current.add(claimTrigger);
    };

    const attemptClaim = async (attempt: number): Promise<void> => {
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
        // Clerk session expired between mount and request — bail silently.
        markTriggerCompleted();
        setStatus('error');
        return;
      }

      if (body.retryAfterWebhook && attempt < MAX_RETRIES) {
        setStatus('retry-after-webhook');
        setTimeout(() => {
          if (!cancelled) void attemptClaim(attempt + 1);
        }, RETRY_DELAY_MS);
        return;
      }

      if (body.claimed && body.claimed > 0) {
        markTriggerCompleted();
        claimedRef.current = true;
        setStatus('claimed');
        // Hand off to the existing /onboarding/checkout flow.
        router.replace(APP_ROUTES.ONBOARDING_CHECKOUT);
        return;
      }

      if (body.alreadyClaimed) {
        // Same user already claimed this transcript (typical retry case).
        markTriggerCompleted();
        claimedRef.current = true;
        setStatus('claimed');
        router.replace(APP_ROUTES.ONBOARDING_CHECKOUT);
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
  }, [claimTrigger, isLoaded, isSignedIn, router]);

  return status;
}
