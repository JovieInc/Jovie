import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { waitForClaimHandoffPaint } from '@/components/features/onboarding/useOnboardingClaim';
import {
  jsonResponse,
  renderClaimHarness,
} from './useOnboardingClaim.test-harness';

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

describe('useOnboardingClaim paint deferral (ONB-50)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('stays idle until Keep handoff can paint before flipping to pending', async () => {
    let resolveFetch!: (value: Response) => void;
    const slowFetch = new Promise<Response>(resolve => {
      resolveFetch = resolve;
    });
    const fetchMock = vi.fn().mockReturnValue(slowFetch);
    vi.stubGlobal('fetch', fetchMock);

    render(renderClaimHarness(0));

    // Same-turn sign-in must not born-pending the Keep card (ONB-49).
    expect(screen.getByTestId('claim-status')).toHaveTextContent('idle');
    expect(fetchMock).not.toHaveBeenCalled();

    await act(async () => {
      await waitForClaimHandoffPaint();
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId('claim-status')).toHaveTextContent('pending');

    await act(async () => {
      resolveFetch(jsonResponse({ claimed: 0 }));
    });
    await waitFor(() =>
      expect(screen.getByTestId('claim-status')).toHaveTextContent('no-op')
    );
  });
});
