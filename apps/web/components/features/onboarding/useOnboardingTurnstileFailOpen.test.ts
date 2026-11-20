import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OnboardingTurnstileState } from './OnboardingTurnstile';
import {
  ONBOARDING_TURNSTILE_FAIL_OPEN_WAIT_MS,
  useOnboardingTurnstileFailOpen,
} from './useOnboardingTurnstileFailOpen';

interface Props {
  readonly state: OnboardingTurnstileState;
  readonly token: string | null;
  readonly instruction: string | null;
}

function setup(initial: Props) {
  return renderHook((props: Props) => useOnboardingTurnstileFailOpen(props), {
    initialProps: initial,
  });
}

describe('useOnboardingTurnstileFailOpen', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('passes a real token through', () => {
    const { result } = setup({
      state: { status: 'verified' },
      token: 'real',
      instruction: null,
    });
    expect(result.current.token).toBe('real');
    expect(result.current.status).toBe('verified');
  });

  it('fails open immediately on a hard widget failure', () => {
    const { result } = setup({
      state: { status: 'unsupported' },
      token: null,
      instruction: null,
    });
    expect(result.current.token).toBe('jv-unverified:unsupported');
    expect(result.current.status).toBe('verified');
  });

  it('fails open after a send waits too long on the check', () => {
    const { result } = setup({
      state: { status: 'interactive' },
      token: null,
      instruction: 'One quick check before we send',
    });
    expect(result.current.token).toBeNull();
    act(() => {
      vi.advanceTimersByTime(ONBOARDING_TURNSTILE_FAIL_OPEN_WAIT_MS);
    });
    expect(result.current.token).toBe('jv-unverified:interactive');
  });

  it('does not fail open while nobody is waiting to send', () => {
    const { result } = setup({
      state: { status: 'loading' },
      token: null,
      instruction: null,
    });
    act(() => {
      vi.advanceTimersByTime(ONBOARDING_TURNSTILE_FAIL_OPEN_WAIT_MS * 2);
    });
    expect(result.current.token).toBeNull();
  });

  it('stops failing open once the server rejects the marker', () => {
    const { result } = setup({
      state: { status: 'error' },
      token: null,
      instruction: null,
    });
    act(() => result.current.onServerRejected());
    expect(result.current.token).toBeNull();
    expect(result.current.status).toBe('error');
  });
});
