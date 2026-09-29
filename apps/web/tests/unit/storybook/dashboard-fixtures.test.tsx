import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  createDashboardQueryClient,
  DASHBOARD_FIXTURE_PROFILE,
  DASHBOARD_FIXTURE_PROFILE_ID,
  DASHBOARD_FIXTURE_USER_ID,
  DashboardStoryProviders,
  DEFAULT_DASHBOARD_DATA,
  withDashboardProviders,
  withOnboardingDashboardProviders,
} from '@/.storybook/dashboard-fixtures';
import { useDashboardData } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import { usePreviewPanelData } from '@/app/app/(shell)/dashboard/PreviewPanelContext';
import { useSetRightPanel } from '@/contexts/RightPanelContext';

function Probe() {
  const dashboardData = useDashboardData();
  const { previewData } = usePreviewPanelData();
  // Calling this hook proves RightPanelProvider is present; nothing to
  // read back since it's dispatch-only.
  useSetRightPanel();
  return (
    <div data-testid='probe'>
      <span data-testid='user-id'>{dashboardData.user?.id}</span>
      <span data-testid='profile-id'>{dashboardData.selectedProfile?.id}</span>
      <span data-testid='needs-onboarding'>
        {String(dashboardData.needsOnboarding)}
      </span>
      <span data-testid='preview-data'>{String(previewData)}</span>
    </div>
  );
}

describe('dashboard-fixtures', () => {
  it('DEFAULT_DASHBOARD_DATA and DASHBOARD_FIXTURE_PROFILE use the documented ids', () => {
    expect(DASHBOARD_FIXTURE_PROFILE_ID).toBe('story-profile');
    expect(DASHBOARD_FIXTURE_USER_ID).toBe('story-user');
    expect(DASHBOARD_FIXTURE_PROFILE?.id).toBe(DASHBOARD_FIXTURE_PROFILE_ID);
    expect(DEFAULT_DASHBOARD_DATA.user?.id).toBe(DASHBOARD_FIXTURE_USER_ID);
    expect(DEFAULT_DASHBOARD_DATA.needsOnboarding).toBe(false);
    expect(DEFAULT_DASHBOARD_DATA.tippingStats.tipClicks).toBe(0);
  });

  it('createDashboardQueryClient returns a client with retries disabled', () => {
    const client = createDashboardQueryClient();
    expect(client.getDefaultOptions().queries?.retry).toBe(false);
    expect(client.getDefaultOptions().mutations?.retry).toBe(false);
  });

  it('DashboardStoryProviders exposes the default fixture to consumers', () => {
    render(
      <DashboardStoryProviders>
        <Probe />
      </DashboardStoryProviders>
    );

    expect(screen.getByTestId('user-id').textContent).toBe(
      DASHBOARD_FIXTURE_USER_ID
    );
    expect(screen.getByTestId('profile-id').textContent).toBe(
      DASHBOARD_FIXTURE_PROFILE_ID
    );
    expect(screen.getByTestId('needs-onboarding').textContent).toBe('false');
    expect(screen.getByTestId('preview-data').textContent).toBe('null');
  });

  it('DashboardStoryProviders accepts overridden dashboard data', () => {
    render(
      <DashboardStoryProviders
        dashboardData={{ ...DEFAULT_DASHBOARD_DATA, needsOnboarding: true }}
      >
        <Probe />
      </DashboardStoryProviders>
    );

    expect(screen.getByTestId('needs-onboarding').textContent).toBe('true');
  });

  it('withDashboardProviders decorator wraps a story with the fixture stack', () => {
    render(
      <>
        {withDashboardProviders(
          () => (
            <Probe />
          ),
          {} as never
        )}
      </>
    );

    expect(screen.getByTestId('user-id').textContent).toBe(
      DASHBOARD_FIXTURE_USER_ID
    );
  });

  it('withOnboardingDashboardProviders reports an onboarding-in-progress profile', () => {
    render(
      <>
        {withOnboardingDashboardProviders(
          () => (
            <Probe />
          ),
          {} as never
        )}
      </>
    );

    expect(screen.getByTestId('needs-onboarding').textContent).toBe('true');
  });
});
