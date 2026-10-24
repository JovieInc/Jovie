import { act, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  markOnboardingConversionSurface,
  resetOnboardingConversionSurfaceForTests,
} from '@/components/features/onboarding/OnboardingChat';
import {
  type OnboardingClaimHandoff,
  useOnboardingClaim,
} from '@/components/features/onboarding/useOnboardingClaim';

const { authState } = vi.hoisted(() => ({
  authState: { isLoaded: true, isSignedIn: true },
}));

vi.mock('@/hooks/useClerkSafe', () => ({
  useAuthSafe: () => ({
    isLoaded: authState.isLoaded,
    isSignedIn: authState.isSignedIn,
    userId: 'user_dev_creator',
  }),
}));

function ClaimHarness({
  trigger,
  enabled = true,
}: {
  readonly trigger: number;
  readonly enabled?: boolean;
}) {
  const [lastHandoff, setLastHandoff] = useState<OnboardingClaimHandoff | null>(
    null
  );
  const status = useOnboardingClaim(trigger, enabled, {
    onHandoffReady: setLastHandoff,
  });
  return (
    <>
      <span data-testid='claim-status'>{status}</span>
      <span data-testid='handoff-kind'>{lastHandoff?.kind ?? 'none'}</span>
    </>
  );
}

function renderClaimHarness(trigger: number) {
  return <ClaimHarness trigger={trigger} />;
}

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });
}

describe('useOnboardingClaim', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    authState.isLoaded = true;
    authState.isSignedIn = true;
    // JOV-8068: the conversion-surface flag is shared with OnboardingChat;
    // reset it so each test controls arming explicitly.
    resetOnboardingConversionSurfaceForTests();
  });

  it('does not reclaim or redirect a restored account-owned conversation on mount or later turns', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { rerender } = render(<ClaimHarness trigger={0} enabled={false} />);
    rerender(<ClaimHarness trigger={2} enabled={false} />);
    expect(screen.getByTestId('claim-status')).toHaveTextContent('idle');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByTestId('handoff-kind')).toHaveTextContent('none');
  });

  it('suppresses the mount claim for a returning signed-in visitor until a turn completes (JOV-8068)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ claimed: 0 }));
    vi.stubGlobal('fetch', fetchMock);

    const { rerender } = render(renderClaimHarness(0));

    // Mount must not fire the claim POST for an already-signed-in session.
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 50));
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByTestId('claim-status')).toHaveTextContent('idle');

    // A completed turn alone still does not claim — the explicit conversion
    // surface must have been offered first.
    fetchMock.mockResolvedValue(jsonResponse({ claimed: 1 }));
    rerender(renderClaimHarness(1));
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 50));
    });
    expect(fetchMock).not.toHaveBeenCalled();

    // Once the conversion surface has been shown, the next turn claims.
    markOnboardingConversionSurface();
    rerender(renderClaimHarness(2));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByTestId('claim-status')).toHaveTextContent('claimed')
    );
    await waitFor(() =>
      expect(screen.getByTestId('handoff-kind')).toHaveTextContent('checkout')
    );
  });

  it('still claims on mount for a visitor who signed in mid-session (JOV-8068)', async () => {
    authState.isSignedIn = false;
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ claimed: 1 }));
    vi.stubGlobal('fetch', fetchMock);

    const { rerender } = render(renderClaimHarness(0));
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 20));
    });
    expect(fetchMock).not.toHaveBeenCalled();

    authState.isSignedIn = true;
    rerender(renderClaimHarness(0));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByTestId('claim-status')).toHaveTextContent('claimed')
    );
    expect(screen.getByTestId('handoff-kind')).toHaveTextContent('checkout');
  });

  it('keeps conflict recovery available while a later claim check is pending', async () => {
    markOnboardingConversionSurface();
    let complete: (response: Response) => void = () => {};
    const pending = new Promise<Response>(resolve => {
      complete = resolve;
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(
          { errorCode: 'SPOTIFY_IDENTITY_CONFLICT' },
          { status: 409 }
        )
      )
      .mockReturnValueOnce(pending);
    vi.stubGlobal('fetch', fetchMock);
    const { rerender } = render(renderClaimHarness(1));
    await waitFor(() =>
      expect(screen.getByTestId('claim-status')).toHaveTextContent(
        'identity-conflict'
      )
    );
    rerender(renderClaimHarness(2));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(screen.getByTestId('claim-status')).toHaveTextContent(
      'identity-conflict'
    );
    expect(screen.getByTestId('handoff-kind')).toHaveTextContent('none');
    await act(async () =>
      complete(
        jsonResponse(
          { errorCode: 'SPOTIFY_IDENTITY_CONFLICT' },
          { status: 409 }
        )
      )
    );
    expect(screen.getByTestId('claim-status')).toHaveTextContent(
      'identity-conflict'
    );
  });

  it.each([
    true,
    false,
  ])('keeps an identity conflict recoverable without checkout or a false reservation (pending=%s)', async pending => {
    markOnboardingConversionSurface();
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(
        pending
          ? {
              claimed: 1,
              waitlist: { entryId: 'receipt' },
              profileError: { errorCode: 'SPOTIFY_IDENTITY_CONFLICT' },
            }
          : { errorCode: 'SPOTIFY_IDENTITY_CONFLICT' },
        { status: pending ? 200 : 409 }
      )
    );
    vi.stubGlobal('fetch', fetchMock);
    const { rerender } = render(renderClaimHarness(1));
    await waitFor(() =>
      expect(screen.getByTestId('claim-status')).toHaveTextContent(
        'identity-conflict'
      )
    );
    expect(screen.getByTestId('handoff-kind')).toHaveTextContent('none');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fetchMock.mockResolvedValue(
      jsonResponse({ claimed: 1, alreadyClaimed: true })
    );
    rerender(renderClaimHarness(2));
    await waitFor(() =>
      expect(screen.getByTestId('handoff-kind')).toHaveTextContent('checkout')
    );
  });

  it('retries a signed-in dev user claim after completed chat activity', async () => {
    markOnboardingConversionSurface();
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ claimed: 0 }));
    vi.stubGlobal('fetch', fetchMock);

    const { rerender } = render(renderClaimHarness(1));

    await waitFor(() =>
      expect(screen.getByTestId('claim-status')).toHaveTextContent('no-op')
    );
    const initialAttemptCount = fetchMock.mock.calls.length;
    expect(initialAttemptCount).toBeGreaterThanOrEqual(1);
    expect(screen.getByTestId('handoff-kind')).toHaveTextContent('none');

    fetchMock.mockResolvedValue(jsonResponse({ claimed: 1 }));
    rerender(renderClaimHarness(2));

    await waitFor(() =>
      expect(fetchMock.mock.calls.length).toBeGreaterThan(initialAttemptCount)
    );
    await waitFor(() =>
      expect(screen.getByTestId('handoff-kind')).toHaveTextContent('checkout')
    );
  });

  it('fires exactly one POST /api/onboarding/claim per claimTrigger value (JOV-2203 dedupe guard)', async () => {
    // Simulate a slow fetch so that multiple effect re-runs can overlap.
    // Without the inflightTriggersRef guard, a second effect re-run
    // (e.g. triggered by a Clerk auth state update) would start a second
    // fetch before the first one resolves.
    let resolveFetch!: (value: Response) => void;
    const slowFetchPromise = new Promise<Response>(resolve => {
      resolveFetch = resolve;
    });
    markOnboardingConversionSurface();
    const fetchMock = vi.fn().mockReturnValue(slowFetchPromise);
    vi.stubGlobal('fetch', fetchMock);

    const { rerender } = render(renderClaimHarness(1));

    // Trigger a second render with the same claimTrigger (simulates Clerk
    // auth state change while the first fetch is still in-flight).
    rerender(renderClaimHarness(1));
    rerender(renderClaimHarness(1));

    // Resolve the pending fetch.
    resolveFetch(jsonResponse({ claimed: 1 }));

    await waitFor(() =>
      expect(screen.getByTestId('claim-status')).toHaveTextContent('claimed')
    );

    // Only one fetch must have been dispatched for trigger=1.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/onboarding/claim',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('fails closed on 403 ownership rejection without a checkout handoff', async () => {
    markOnboardingConversionSurface();
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse(
          { error: 'Forbidden', errorCode: 'FORBIDDEN' },
          { status: 403 }
        )
      );
    vi.stubGlobal('fetch', fetchMock);

    render(renderClaimHarness(1));

    await waitFor(() =>
      expect(screen.getByTestId('claim-status')).toHaveTextContent('error')
    );
    expect(screen.getByTestId('handoff-kind')).toHaveTextContent('none');
  });

  it('reports a waitlist handoff only when the claim returns a durable entry id', async () => {
    markOnboardingConversionSurface();
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        claimed: 1,
        waitlist: {
          entryId: 'entry-1',
          status: 'waitlisted',
          outcome: 'waitlisted_gate_on',
        },
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    render(renderClaimHarness(1));

    await waitFor(() =>
      expect(screen.getByTestId('claim-status')).toHaveTextContent('claimed')
    );
    expect(screen.getByTestId('handoff-kind')).toHaveTextContent('waitlist');
  });

  it('keeps missing durable artist data in the same /start conversation', async () => {
    markOnboardingConversionSurface();
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        claimed: 0,
        waitlistIntakeRequired: true,
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    render(renderClaimHarness(1));

    await waitFor(() =>
      expect(screen.getByTestId('claim-status')).toHaveTextContent('no-op')
    );
    expect(screen.getByTestId('handoff-kind')).toHaveTextContent('none');
  });

  it('retries claim after the next natural-language turn when artist identity was missing', async () => {
    markOnboardingConversionSurface();
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        claimed: 0,
        waitlistIntakeRequired: true,
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const { rerender } = render(renderClaimHarness(1));

    await waitFor(() =>
      expect(screen.getByTestId('claim-status')).toHaveTextContent('no-op')
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fetchMock.mockResolvedValue(
      jsonResponse({
        claimed: 1,
        waitlist: {
          entryId: 'entry-1',
          status: 'waitlisted',
          outcome: 'waitlisted_gate_on',
        },
      })
    );
    rerender(renderClaimHarness(2));

    await waitFor(() =>
      expect(screen.getByTestId('claim-status')).toHaveTextContent('claimed')
    );
    expect(screen.getByTestId('handoff-kind')).toHaveTextContent('waitlist');
  });

  it('fails closed without a handoff when the waitlist write returns no receipt', async () => {
    markOnboardingConversionSurface();
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(
        {
          error: 'Waitlist request could not be saved',
          errorCode: 'WAITLIST_SAVE_FAILED',
        },
        { status: 500 }
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    render(renderClaimHarness(1));

    await waitFor(() =>
      expect(screen.getByTestId('claim-status')).toHaveTextContent('error')
    );
    expect(screen.getByTestId('handoff-kind')).toHaveTextContent('none');
  });

  it('fires exactly one POST per unique claimTrigger and does not fire again for the same trigger after completion', async () => {
    markOnboardingConversionSurface();
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ claimed: 0 }));
    vi.stubGlobal('fetch', fetchMock);

    const { rerender } = render(renderClaimHarness(1));

    await waitFor(() =>
      expect(screen.getByTestId('claim-status')).toHaveTextContent('no-op')
    );
    // Exactly one call for trigger=1.
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Re-render with the same trigger — must NOT fire again (already completed).
    rerender(renderClaimHarness(1));
    rerender(renderClaimHarness(1));

    // Give React time to settle any effects.
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 50));
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Advance to trigger=2 — must fire exactly once.
    fetchMock.mockResolvedValue(jsonResponse({ claimed: 1 }));
    rerender(renderClaimHarness(2));

    await waitFor(() =>
      expect(screen.getByTestId('claim-status')).toHaveTextContent('claimed')
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
