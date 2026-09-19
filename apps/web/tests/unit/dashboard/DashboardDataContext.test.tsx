import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DashboardData } from '@/app/app/(shell)/dashboard/actions/dashboard-data';
import {
  DashboardDataProvider,
  useDashboardData,
} from '@/app/app/(shell)/dashboard/DashboardDataContext';
import {
  applyCacheScope,
  getCacheScope,
  resetCacheIsolationForTests,
  subscribeCacheFence,
} from '@/lib/queries/cache-isolation';
import { fastRender } from '@/tests/utils/fast-render';

const baseDashboardData: DashboardData = {
  user: { id: 'user_123' },
  creatorProfiles: [],
  selectedProfile: null,
  needsOnboarding: false,
  sidebarCollapsed: false,
  hasSocialLinks: false,
  hasMusicLinks: false,
  isAdmin: false,
  tippingStats: {
    tipClicks: 0,
    qrTipClicks: 0,
    linkTipClicks: 0,
    tipsSubmitted: 0,
    totalReceivedCents: 0,
    monthReceivedCents: 0,
  },
  profileCompletion: {
    percentage: 0,
    completedCount: 0,
    totalCount: 5,
    steps: [],
    profileIsLive: false,
  },
};

function ProfileCompletionProbe() {
  const { profileCompletion } = useDashboardData();

  return <span>{profileCompletion.percentage}%</span>;
}

describe('DashboardDataContext', () => {
  beforeEach(() => {
    resetCacheIsolationForTests();
  });

  afterEach(() => {
    resetCacheIsolationForTests();
  });

  it('normalizes missing profileCompletion to a safe default object', () => {
    const { getByText } = fastRender(
      <DashboardDataProvider
        value={{
          ...baseDashboardData,
          profileCompletion:
            undefined as unknown as DashboardData['profileCompletion'],
        }}
      >
        <ProfileCompletionProbe />
      </DashboardDataProvider>
    );

    expect(getByText('0%')).toBeDefined();
  });

  it('fences cache identity when the selected profile changes', () => {
    applyCacheScope({
      userId: 'user-a',
      sessionId: 'sess-a',
      profileId: 'profile-1',
      ready: true,
    });
    const fences: string[] = [];
    const unsubscribe = subscribeCacheFence(event => {
      fences.push(event.reason);
    });

    const { rerender } = fastRender(
      <DashboardDataProvider
        value={{
          ...baseDashboardData,
          selectedProfile: {
            id: 'profile-1',
          } as DashboardData['selectedProfile'],
        }}
      >
        <ProfileCompletionProbe />
      </DashboardDataProvider>
    );

    rerender(
      <DashboardDataProvider
        value={{
          ...baseDashboardData,
          selectedProfile: {
            id: 'profile-2',
          } as DashboardData['selectedProfile'],
        }}
      >
        <ProfileCompletionProbe />
      </DashboardDataProvider>
    );

    expect(getCacheScope().profileId).toBe('profile-2');
    expect(fences).toContain('profile-switch');
    unsubscribe();
  });
});
