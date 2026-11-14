'use client';

import { useEffect, useState } from 'react';
import { type PaidPlanId, resolvePaidPlan } from './checkout-success-state';

// Per page visit (or explicit retry): at most six reads, no background polling.
export const CHECKOUT_CONFIRMATION_ATTEMPTS = 6;
export const CHECKOUT_CONFIRMATION_INTERVAL_MS = 5_000;
const REQUEST_TIMEOUT_MS = 10_000;

type Receipt = {
  status: 'pending' | 'unconfirmed' | 'confirmed';
  plan: PaidPlanId | null;
  paymentStatus: 'paid' | 'no_payment_required' | null;
  needsProfile: boolean;
  proofPending: boolean;
  shareUrl: string | null;
};

const UNCONFIRMED: Receipt = {
  status: 'unconfirmed',
  plan: null,
  paymentStatus: null,
  needsProfile: false,
  proofPending: false,
  shareUrl: null,
};

async function readReceipt(
  sessionId: string,
  signal: AbortSignal
): Promise<Receipt> {
  const response = await fetch(
    `/api/billing/checkout-session?session_id=${encodeURIComponent(sessionId)}`,
    { cache: 'no-store', signal }
  );
  if (!response.ok) {
    return {
      ...UNCONFIRMED,
      status: response.status === 503 ? 'pending' : 'unconfirmed',
    };
  }
  const body = (await response.json()) as Partial<Receipt> & {
    profileShareUrl?: string | null;
  };
  const plan = resolvePaidPlan(body.plan);
  const paymentStatus =
    body.paymentStatus === 'paid' ||
    body.paymentStatus === 'no_payment_required'
      ? body.paymentStatus
      : null;
  return {
    status:
      body.status === 'pending'
        ? 'pending'
        : body.status === 'confirmed' && plan && paymentStatus
          ? 'confirmed'
          : 'unconfirmed',
    plan,
    paymentStatus,
    needsProfile: body.needsProfile === true,
    proofPending: body.proofPending === true,
    shareUrl:
      typeof body.profileShareUrl === 'string' ? body.profileShareUrl : null,
  };
}

export function useCheckoutConfirmation(sessionId: string | null) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{
    sessionId: string;
    attempt: number;
    receipt: Receipt;
    pending: boolean;
  } | null>(null);

  useEffect(() => {
    if (!sessionId) return;
    const controller = new AbortController();
    let activeRequest: AbortController | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let requestTimer: ReturnType<typeof setTimeout> | undefined;
    let reads = 0;
    const check = async () => {
      const request = new AbortController();
      activeRequest = request;
      requestTimer = setTimeout(() => request.abort(), REQUEST_TIMEOUT_MS);
      let receipt = UNCONFIRMED;
      try {
        receipt = await readReceipt(sessionId, request.signal);
      } catch {
        // A failed read does not establish either payment or entitlement.
      } finally {
        clearTimeout(requestTimer);
        activeRequest = undefined;
      }
      if (controller.signal.aborted) return;
      reads += 1;
      const pending =
        receipt.status === 'pending' && reads < CHECKOUT_CONFIRMATION_ATTEMPTS;
      setState({ sessionId, attempt, receipt, pending });
      if (pending) timer = setTimeout(check, CHECKOUT_CONFIRMATION_INTERVAL_MS);
    };
    void check();
    return () => {
      controller.abort();
      activeRequest?.abort();
      clearTimeout(timer);
      clearTimeout(requestTimer);
    };
  }, [sessionId, attempt]);

  // A changed URL or retry cannot render the previous session's success while
  // the effect is waiting to start, and late responses are discarded on cleanup.
  const current =
    state?.sessionId === sessionId && state.attempt === attempt ? state : null;
  return {
    receipt: current?.receipt ?? UNCONFIRMED,
    pending: Boolean(sessionId) && (current?.pending ?? true),
    retry: () => setAttempt(value => value + 1),
  };
}
