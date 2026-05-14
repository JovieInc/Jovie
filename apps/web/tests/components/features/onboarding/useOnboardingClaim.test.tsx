import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useOnboardingClaim } from '@/components/features/onboarding/useOnboardingClaim';
import { ClerkSafeBootstrapProvider } from '@/hooks/useClerkSafe';
import type { ClientAuthBootstrap } from '@/lib/auth/dev-test-auth-types';

const { replaceMock } = vi.hoisted(() => ({
  replaceMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: replaceMock,
  }),
}));

const bootstrap: ClientAuthBootstrap = {
  isAuthenticated: true,
  userId: 'user_dev_creator',
  email: 'creator@example.com',
  username: 'creator',
  fullName: 'Creator Example',
  isAdmin: false,
  persona: 'creator',
};

function ClaimHarness({ trigger }: { readonly trigger: number }) {
  const status = useOnboardingClaim(trigger);
  return <span data-testid='claim-status'>{status}</span>;
}

function renderClaimHarness(trigger: number) {
  return (
    <ClerkSafeBootstrapProvider bootstrap={bootstrap}>
      <ClaimHarness trigger={trigger} />
    </ClerkSafeBootstrapProvider>
  );
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
});
