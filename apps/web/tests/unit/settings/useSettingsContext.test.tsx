import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSettingsContext } from '@/features/dashboard/organisms/useSettingsContext';

const { billingState } = vi.hoisted(() => ({
  billingState: { plan: 'free' },
}));

vi.mock('@/app/app/(shell)/dashboard/DashboardDataContext', () => ({
  useDashboardData: () => ({
    avatarQuality: undefined,
    isAdmin: false,
    selectedProfile: null,
  }),
}));

vi.mock('@/lib/queries', () => ({
  useBillingStatusQuery: () => ({
    data: { isPro: true, plan: billingState.plan },
  }),
}));

describe('useSettingsContext plan aliases', () => {
  beforeEach(() => {
    billingState.plan = 'free';
  });

  it.each(['max', 'growth'])('grants advanced settings for %s', plan => {
    billingState.plan = plan;

    const { result } = renderHook(() => useSettingsContext());

    expect(result.current.isGrowth).toBe(true);
  });
});
