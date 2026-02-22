import { describe, expect, it } from 'vitest';
import type { DashboardData } from '@/app/app/(shell)/dashboard/actions/dashboard-data';
import {
  DashboardDataProvider,
  useDashboardData,
} from '@/app/app/(shell)/dashboard/DashboardDataContext';
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
    totalCount: 7,
    steps: [],
  },
};

function ProfileCompletionProbe() {
  const { profileCompletion } = useDashboardData();

  return <span>{profileCompletion.percentage}%</span>;
}

describe('DashboardDataContext', () => {
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
});
