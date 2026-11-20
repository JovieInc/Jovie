'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  TURNSTILE_CLIENT_FAILURE_STATUSES,
  type TurnstileClientFailureStatus,
  unverifiedTurnstileToken,
} from '@/lib/turnstile/unverified-token';
import type {
  OnboardingTurnstileState,
  OnboardingTurnstileStatus,
} from './OnboardingTurnstile';

/**
 * How long a send waits on a silent or interactive Turnstile pass before it
 * goes out without a token. Long enough for a normal execute pass, short
 * enough that nobody stares at "One quick check" on a slow network.
 */
export const ONBOARDING_TURNSTILE_FAIL_OPEN_WAIT_MS = 8_000;

/** Widget states that will not produce a token without a page change. */
const HARD_FAILURES: ReadonlySet<OnboardingTurnstileStatus> = new Set([
  'error',
  'unsupported',
  'unconfigured',
]);

interface FailOpenInput {
  readonly state: OnboardingTurnstileState;
  readonly token: string | null;
  /** Set while a send is waiting on the check. */
  readonly instruction: string | null;
}

interface FailOpenResult {
  /** The real token, the fail-open marker, or null while still waiting. */
  readonly token: string | null;
  readonly status: OnboardingTurnstileStatus;
  /**
   * Call when the server rejects the first message. A rejected fail-open
   * marker means the unverified budget is spent, so later sends wait for a
   * real token (the retryable security check) instead of looping.
   */
  readonly onServerRejected: () => void;
}

/**
 * Fail open for humans on /start: a Turnstile failure never blocks the
 * first message. A hard widget failure, or a send that waited past
 * {@link ONBOARDING_TURNSTILE_FAIL_OPEN_WAIT_MS}, hands the chat a marker
 * token; the server admits it on the tighter unverified budget.
 */
export function useOnboardingTurnstileFailOpen({
  state,
  token,
  instruction,
}: FailOpenInput): FailOpenResult {
  const [waitExpired, setWaitExpired] = useState(false);
  const [spent, setSpent] = useState(false);
  const failOpenActiveRef = useRef(false);
  const waiting =
    !token &&
    !spent &&
    Boolean(instruction) &&
    (state.status === 'loading' || state.status === 'interactive');

  useEffect(() => {
    if (token) setWaitExpired(false);
  }, [token]);

  useEffect(() => {
    if (!waiting) return;
    const timer = globalThis.setTimeout(
      () => setWaitExpired(true),
      ONBOARDING_TURNSTILE_FAIL_OPEN_WAIT_MS
    );
    return () => globalThis.clearTimeout(timer);
  }, [waiting]);

  const failOpen =
    !token && !spent && (HARD_FAILURES.has(state.status) || waitExpired);
  useEffect(() => {
    failOpenActiveRef.current = failOpen;
  }, [failOpen]);

  const onServerRejected = useCallback(() => {
    if (!failOpenActiveRef.current) return;
    setSpent(true);
    setWaitExpired(false);
  }, []);

  if (!failOpen) return { token, status: state.status, onServerRejected };
  const reported = (
    TURNSTILE_CLIENT_FAILURE_STATUSES as readonly string[]
  ).includes(state.status)
    ? (state.status as TurnstileClientFailureStatus)
    : 'loading';
  return {
    token: unverifiedTurnstileToken(reported),
    status: 'verified',
    onServerRejected,
  };
}
