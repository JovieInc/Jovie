import { beforeEach, describe, expect, it, vi } from 'vitest';

// Hoisted mocks must be declared before any imports that use them.
const { getOrMintOnboardingSessionIdMock, captureErrorMock, redirectMock } =
  vi.hoisted(() => ({
    getOrMintOnboardingSessionIdMock: vi.fn(),
    captureErrorMock: vi.fn(),
    // In real Next.js, redirect() throws a NEXT_REDIRECT error so execution
    // stops. Simulate that behaviour so the catch branch returns cleanly.
    redirectMock: vi.fn(() => {
      throw new Error('NEXT_REDIRECT');
    }),
  }));

vi.mock('@/lib/onboarding/session', () => ({
  getOrMintOnboardingSessionId: getOrMintOnboardingSessionIdMock,
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: captureErrorMock,
}));

vi.mock('next/navigation', () => ({
  redirect: redirectMock,
}));

// OnboardingShell is a UI component we don't need to render in this test.
vi.mock('@/components/features/onboarding/OnboardingShell', () => ({
  OnboardingShell: () => null,
}));

import { APP_ROUTES } from '@/constants/routes';

import StartPage from './page';

describe('StartPage — session error fallback', () => {
  beforeEach(() => {
    getOrMintOnboardingSessionIdMock.mockReset();
    captureErrorMock.mockReset();
    redirectMock.mockReset();
    // Re-apply the throw so each test inherits the real-Next.js behaviour.
    redirectMock.mockImplementation(() => {
      throw new Error('NEXT_REDIRECT');
    });
  });

  it('calls captureError + redirect(/signup) when getOrMintOnboardingSessionId throws', async () => {
    const boom = new Error('SESSION_SECRET is not configured');
    getOrMintOnboardingSessionIdMock.mockRejectedValueOnce(boom);
    captureErrorMock.mockResolvedValue(undefined);

    // The page will throw NEXT_REDIRECT — catch it so the test doesn't fail.
    await expect(StartPage()).rejects.toThrow('NEXT_REDIRECT');

    expect(captureErrorMock).toHaveBeenCalledWith(
      expect.stringContaining('SESSION_SECRET'),
      boom,
      expect.objectContaining({ route: '/start' })
    );
    expect(redirectMock).toHaveBeenCalledWith(APP_ROUTES.SIGNUP);
  });

  it('renders normally (returns JSX) and does not redirect when session minting succeeds', async () => {
    getOrMintOnboardingSessionIdMock.mockResolvedValueOnce({
      sessionId: '00112233-4455-6677-8899-aabbccddeeff',
      origin: 'minted',
    });

    const result = await StartPage();

    expect(result).toBeDefined();
    expect(redirectMock).not.toHaveBeenCalled();
    expect(captureErrorMock).not.toHaveBeenCalled();
  });
});
