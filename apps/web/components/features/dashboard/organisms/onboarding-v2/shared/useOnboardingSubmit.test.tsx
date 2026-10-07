import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useOnboardingSubmit } from './useOnboardingSubmit';

const { complete, track, push } = vi.hoisted(() => ({
  complete: vi.fn(),
  track: vi.fn(),
  push: vi.fn(),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('@/app/onboarding/actions', () => ({ completeOnboarding: complete }));
vi.mock('@/app/onboarding/actions/connect-spotify', () => ({
  connectOnboardingSpotifyArtist: vi.fn(),
}));
vi.mock('@/app/onboarding/actions/enrich-profile', () => ({
  enrichProfileFromDsp: vi.fn(),
}));
vi.mock('@/lib/analytics', () => ({ track, identify: vi.fn() }));
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }));

describe('useOnboardingSubmit claim recovery', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows serialized expired-claim recovery without completing or navigating', async () => {
    complete.mockResolvedValue(JSON.parse('{"error":"CLAIM_EXPIRED"}'));
    const onCompleted = vi.fn();
    const goToNextStep = vi.fn();
    const setProfileReadyHandle = vi.fn();
    const { result } = renderHook(() =>
      useOnboardingSubmit({
        userId: 'user-123',
        userEmail: 'artist@example.com',
        fullName: 'Artist',
        handle: 'artist',
        handleInput: 'artist',
        handleValidation: {
          checking: false,
          clientValid: true,
          available: true,
          error: null,
          suggestions: [],
        },
        isHydrated: true,
        goToNextStep,
        setProfileReadyHandle,
        shouldAutoSubmitHandle: false,
        isReservedHandle: false,
        onboardingStartedAtMs: Date.now(),
        onCompleted,
      })
    );

    await act(async () => {
      await result.current.handleSubmit();
    });
    expect(result.current.state).toMatchObject({
      step: 'validating',
      progress: 0,
      isSubmitting: false,
      error:
        'This claim link has expired or is no longer valid. Please request a new claim link.',
    });
    expect(onCompleted).not.toHaveBeenCalled();
    expect(goToNextStep).not.toHaveBeenCalled();
    expect(setProfileReadyHandle).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
    expect(track).not.toHaveBeenCalledWith(
      'onboarding_completed',
      expect.anything()
    );
  });
});
