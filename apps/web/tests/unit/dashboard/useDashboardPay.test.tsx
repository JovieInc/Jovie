import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useDashboardPay } from '@/features/dashboard/dashboard-pay/useDashboardPay';

const hoisted = vi.hoisted(() => ({
  convertProfile: vi.fn(),
  mutateAsync: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: hoisted.refresh }),
}));

vi.mock('@/app/app/(shell)/dashboard/DashboardDataContext', () => ({
  useDashboardData: () => ({
    selectedProfile: {
      id: 'selected-profile-id',
      venmoHandle: '@selected',
    },
  }),
}));

vi.mock('@/components/feedback', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock('@/lib/queries', () => ({
  useUpdateVenmoMutation: () => ({
    isPending: false,
    mutateAsync: hoisted.mutateAsync,
  }),
}));

vi.mock('@/types/db', () => ({
  convertDrizzleCreatorProfileToArtist: hoisted.convertProfile,
}));

describe('useDashboardPay', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.convertProfile.mockReturnValue({
      id: 'stale-profile-id',
      venmo_handle: '@stale',
    });
  });

  it('does not mutate when local artist state belongs to another profile', async () => {
    const { result } = renderHook(() => useDashboardPay());

    await act(async () => {
      await result.current.handleSaveVenmo();
      await result.current.handleDisconnect();
    });

    expect(hoisted.mutateAsync).not.toHaveBeenCalled();
    expect(hoisted.refresh).not.toHaveBeenCalled();
  });
});
