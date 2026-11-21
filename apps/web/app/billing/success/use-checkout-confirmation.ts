'use client';

import { useEffect, useState } from 'react';
import {
  normalizeOpenCheckoutUrl,
  type PaidPlanId,
  resolvePaidPlan,
} from './checkout-success-state';

/** One visit or explicit retry: at most six reads, five seconds apart. */
export const CHECKOUT_CONFIRMATION_ATTEMPTS = 6;
export const CHECKOUT_CONFIRMATION_INTERVAL_MS = 5_000;
const REQUEST_TIMEOUT_MS = 10_000;

export type CheckoutReceipt = {
  status: 'pending' | 'unconfirmed' | 'confirmed';
  plan: PaidPlanId | null;
  paymentStatus: 'paid' | 'no_payment_required' | null;
  needsProfile: boolean;
  proofPending: boolean;
  profileLive: boolean | null;
  shareUrl: string | null;
  sessionStatus: string | null;
  checkoutUrl: string | null;
};

const UNCONFIRMED: CheckoutReceipt = {
  status: 'unconfirmed',
  plan: null,
  paymentStatus: null,
  needsProfile: false,
  proofPending: false,
  profileLive: null,
  shareUrl: null,
  sessionStatus: null,
  checkoutUrl: null,
};

async function readReceipt(
  sessionId: string,
  signal: AbortSignal
): Promise<CheckoutReceipt> {
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
  const body = (await response.json()) as Partial<CheckoutReceipt> & {
    profileShareUrl?: string | null;
    profileLive?: boolean;
  };
  const plan = resolvePaidPlan(body.plan);
  const paymentStatus =
    body.paymentStatus === 'paid' ||
    body.paymentStatus === 'no_payment_required'
      ? body.paymentStatus
      : null;
  const proofPending = body.proofPending === true;
  const needsProfile = body.needsProfile === true;
  const profileLive =
    typeof body.profileLive === 'boolean' ? body.profileLive : null;
  const confirmed =
    body.status === 'confirmed' && plan !== null && paymentStatus !== null;
  return {
    status: confirmed
      ? 'confirmed'
      : body.status === 'pending'
        ? 'pending'
        : 'unconfirmed',
    plan: confirmed ? plan : null,
    paymentStatus: confirmed ? paymentStatus : null,
    needsProfile,
    proofPending,
    profileLive,
    shareUrl:
      confirmed &&
      !proofPending &&
      !needsProfile &&
      profileLive !== false &&
      typeof body.profileShareUrl === 'string'
        ? body.profileShareUrl
        : null,
    sessionStatus:
      typeof body.sessionStatus === 'string' ? body.sessionStatus : null,
    checkoutUrl: normalizeOpenCheckoutUrl(body.checkoutUrl),
  };
}

export function useCheckoutConfirmation(sessionId: string | null) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{
    sessionId: string;
    attempt: number;
    receipt: CheckoutReceipt;
    pending: boolean;
  } | null>(null);

  useEffect(() => {
    if (!sessionId) return;
    const lifecycle = new AbortController();
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
        // A failed read does not establish payment or entitlement.
      } finally {
        clearTimeout(requestTimer);
        activeRequest = undefined;
      }
      if (lifecycle.signal.aborted) return;
      reads += 1;
      const pending =
        receipt.status === 'pending' && reads < CHECKOUT_CONFIRMATION_ATTEMPTS;
      setState({ sessionId, attempt, receipt, pending });
      if (pending) {
        timer = setTimeout(check, CHECKOUT_CONFIRMATION_INTERVAL_MS);
      }
    };

    void check();
    return () => {
      lifecycle.abort();
      activeRequest?.abort();
      clearTimeout(timer);
      clearTimeout(requestTimer);
    };
  }, [sessionId, attempt]);

  const current =
    state?.sessionId === sessionId && state.attempt === attempt ? state : null;
  return {
    receipt: current?.receipt ?? UNCONFIRMED,
    pending: Boolean(sessionId) && (current?.pending ?? true),
    retry: () => setAttempt(value => value + 1),
  };
}
