import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSubscriptionForm } from '@/features/profile/artist-notifications-cta/useSubscriptionForm';
import { NOTIFICATION_COPY } from '@/lib/notifications/client';
import type { Artist } from '@/types/db';

const mockShowSuccess = vi.hoisted(() => vi.fn());
const mockShowError = vi.hoisted(() => vi.fn());
const mockSubscribeMutateAsync = vi.hoisted(() => vi.fn());
const mockVerifyOtpMutateAsync = vi.hoisted(() => vi.fn());
const mockTrack = vi.hoisted(() => vi.fn());
const mockCaptureError = vi.hoisted(() => vi.fn());

vi.mock('@/components/organisms/profile-shell', () => ({
  useProfileNotifications: () => ({
    state: 'idle',
    setState: vi.fn(),
    hydrationStatus: 'done',
    notificationsEnabled: true,
    channel: 'email',
    setChannel: vi.fn(),
    subscribedChannels: {},
    setSubscribedChannels: vi.fn(),
    setSubscriptionDetails: vi.fn(),
    openSubscription: vi.fn(),
    registerInputFocus: vi.fn(),
    smsEnabled: false,
  }),
}));

vi.mock('@/lib/hooks/useNotifications', () => ({
  useNotifications: () => ({
    success: mockShowSuccess,
    error: mockShowError,
  }),
}));

vi.mock('@/lib/queries/useNotificationStatusQuery', () => ({
  useSubscribeNotificationsMutation: () => ({
    mutateAsync: mockSubscribeMutateAsync,
  }),
  useVerifyEmailOtpMutation: () => ({
    mutateAsync: mockVerifyOtpMutateAsync,
  }),
}));

vi.mock('@/lib/analytics', () => ({
  track: mockTrack,
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: mockCaptureError,
}));

const artist: Artist = {
  id: 'artist-1',
  owner_user_id: 'owner-1',
  handle: 'testartist',
  spotify_id: 'spotify-1',
  name: 'Test Artist',
  published: true,
  is_verified: false,
  is_featured: false,
  marketing_opt_out: false,
  created_at: new Date().toISOString(),
} as Artist;

describe('useSubscriptionForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps subscribe failures inline and does not raise a toast error', async () => {
    mockSubscribeMutateAsync.mockRejectedValueOnce(new Error('Server error'));

    const { result } = renderHook(() => useSubscriptionForm({ artist }));

    await act(async () => {
      result.current.handleEmailChange('fan@example.com');
    });

    await act(async () => {
      await result.current.handleSubscribe();
    });

    expect(result.current.error).toBe(NOTIFICATION_COPY.errors.subscribe);
    expect(mockShowError).not.toHaveBeenCalled();
    expect(mockCaptureError).toHaveBeenCalledWith(
      'Notification subscription failed',
      expect.any(Error),
      expect.objectContaining({
        artistId: artist.id,
        artistHandle: artist.handle,
        channel: 'email',
        source: 'profile_inline',
      })
    );
  });

  it('starts a resend cooldown when subscription requires OTP verification', async () => {
    mockSubscribeMutateAsync.mockResolvedValueOnce({
      pendingConfirmation: true,
    });

    const { result } = renderHook(() => useSubscriptionForm({ artist }));

    await act(async () => {
      result.current.handleEmailChange('fan@example.com');
    });

    const beforeSubmit = Date.now();

    await act(async () => {
      await result.current.handleSubscribe();
    });

    expect(result.current.otpStep).toBe('verify');
    expect(result.current.resendCooldownEnd).toBeGreaterThanOrEqual(
      beforeSubmit + 30_000
    );
    expect(result.current.resendCooldownEnd).toBeLessThanOrEqual(
      Date.now() + 30_000
    );
  });

  it('fires otp_verified event with source context on successful OTP verification (JOV-2360)', async () => {
    mockVerifyOtpMutateAsync.mockResolvedValueOnce({ success: true });

    const { result } = renderHook(() =>
      useSubscriptionForm({ artist, source: 'subscribe_tab' })
    );

    await act(async () => {
      result.current.handleEmailChange('fan@example.com');
    });

    await act(async () => {
      await result.current.handleVerifyOtp('123456');
    });

    expect(mockTrack).toHaveBeenCalledWith(
      'otp_verified',
      expect.objectContaining({
        source: 'subscribe_tab',
        channel: 'email',
        handle: artist.handle,
      })
    );
  });

  it('fires otp_verify_error event with source context on OTP verification failure (JOV-2360)', async () => {
    mockVerifyOtpMutateAsync.mockRejectedValueOnce(
      new Error('Invalid verification code')
    );

    const { result } = renderHook(() =>
      useSubscriptionForm({ artist, source: 'hero_alerts_button' })
    );

    await act(async () => {
      result.current.handleEmailChange('fan@example.com');
    });

    await act(async () => {
      await result.current.handleVerifyOtp('654321');
    });

    expect(mockTrack).toHaveBeenCalledWith(
      'otp_verify_error',
      expect.objectContaining({
        source: 'hero_alerts_button',
        channel: 'email',
        handle: artist.handle,
      })
    );
  });

  it('includes alert opt-in experiment variant in subscribe analytics', async () => {
    mockSubscribeMutateAsync.mockResolvedValueOnce({
      pendingConfirmation: false,
    });

    const { result } = renderHook(() =>
      useSubscriptionForm({ artist, experimentVariant: 'toggle' })
    );

    await act(async () => {
      result.current.handleEmailChange('fan@example.com');
    });

    await act(async () => {
      await result.current.handleSubscribe();
    });

    expect(mockTrack).toHaveBeenCalledWith(
      'subscribe_click',
      expect.objectContaining({
        alert_opt_in_variant: 'toggle',
      })
    );
    expect(mockTrack).toHaveBeenCalledWith(
      'notifications_subscribe_success',
      expect.objectContaining({
        alert_opt_in_variant: 'toggle',
      })
    );
  });
});
