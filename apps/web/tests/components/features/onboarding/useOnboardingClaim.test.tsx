import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useOnboardingClaim } from '@/components/features/onboarding/useOnboardingClaim';

const { replaceMock } = vi.hoisted(() => ({
  replaceMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: replaceMock,
  }),
}));

vi.mock('@/hooks/useClerkSafe', () => ({
  useAuthSafe: () => ({
    isLoaded: true,
    isSignedIn: true,
    userId: 'user_dev_creator',
  }),
}));

function ClaimHarness({ trigger }: { readonly trigger: number }) {
  const status = useOnboardingClaim(trigger);
  return <span data-testid='claim-status'>{status}</span>;
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
  });

  it('retries a signed-in dev user claim after completed chat activity', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ claimed: 0 }));
    vi.stubGlobal('fetch', fetchMock);

    const { rerender } = render(renderClaimHarness(0));

    await waitFor(() =>
      expect(screen.getByTestId('claim-status')).toHaveTextContent('no-op')
    );
    const initialAttemptCount = fetchMock.mock.calls.length;
    expect(initialAttemptCount).toBeGreaterThanOrEqual(1);
    expect(replaceMock).not.toHaveBeenCalled();

    fetchMock.mockResolvedValue(jsonResponse({ claimed: 1 }));
    rerender(renderClaimHarness(1));

    await waitFor(() =>
      expect(fetchMock.mock.calls.length).toBeGreaterThan(initialAttemptCount)
    );
    await waitFor(() =>
      expect(replaceMock).toHaveBeenCalledWith('/onboarding/checkout')
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
    const fetchMock = vi.fn().mockReturnValue(slowFetchPromise);
    vi.stubGlobal('fetch', fetchMock);

    const { rerender } = render(renderClaimHarness(0));

    // Trigger a second render with the same claimTrigger (simulates Clerk
    // auth state change while the first fetch is still in-flight).
    rerender(renderClaimHarness(0));
    rerender(renderClaimHarness(0));

    // Resolve the pending fetch.
    resolveFetch(jsonResponse({ claimed: 1 }));

    await waitFor(() =>
      expect(screen.getByTestId('claim-status')).toHaveTextContent('claimed')
    );

    // Only one fetch must have been dispatched for trigger=0.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/onboarding/claim',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('fails closed on 403 ownership rejection without navigating to checkout', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse(
          { error: 'Forbidden', errorCode: 'FORBIDDEN' },
          { status: 403 }
        )
      );
    vi.stubGlobal('fetch', fetchMock);

    render(renderClaimHarness(0));

    await waitFor(() =>
      expect(screen.getByTestId('claim-status')).toHaveTextContent('error')
    );
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it('fires exactly one POST per unique claimTrigger and does not fire again for the same trigger after completion', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ claimed: 0 }));
    vi.stubGlobal('fetch', fetchMock);

    const { rerender } = render(renderClaimHarness(0));

    await waitFor(() =>
      expect(screen.getByTestId('claim-status')).toHaveTextContent('no-op')
    );
    // Exactly one call for trigger=0.
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Re-render with the same trigger — must NOT fire again (already completed).
    rerender(renderClaimHarness(0));
    rerender(renderClaimHarness(0));

    // Give React time to settle any effects.
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Advance to trigger=1 — must fire exactly once.
    fetchMock.mockResolvedValue(jsonResponse({ claimed: 1 }));
    rerender(renderClaimHarness(1));

    await waitFor(() =>
      expect(screen.getByTestId('claim-status')).toHaveTextContent('claimed')
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
