import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DashboardLoadTracker } from '@/app/app/(shell)/DashboardLoadTracker';
import { track } from '@/lib/analytics';
import { ONBOARDING_FUNNEL_EVENTS } from '@/lib/onboarding/funnel-events';

vi.mock('@/lib/analytics', () => ({
  track: vi.fn(),
}));

describe('DashboardLoadTracker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
  });

  it('tracks dashboard_loaded once per user session across route changes and remounts', () => {
    const { rerender, unmount } = render(
      <DashboardLoadTracker pathname='/app/dashboard' userId='user_1' />
    );

    expect(track).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith(
      ONBOARDING_FUNNEL_EVENTS.DASHBOARD_LOADED,
      {
        pathname: '/app/dashboard',
        user_id: 'user_1',
      }
    );

    rerender(<DashboardLoadTracker pathname='/app/library' userId='user_1' />);
    expect(track).toHaveBeenCalledTimes(1);

    unmount();
    render(<DashboardLoadTracker pathname='/app/chat' userId='user_1' />);
    expect(track).toHaveBeenCalledTimes(1);
  });

  it('tracks a new dashboard load when the signed-in user changes', () => {
    const { rerender } = render(
      <DashboardLoadTracker pathname='/app/dashboard' userId='user_1' />
    );

    rerender(
      <DashboardLoadTracker pathname='/app/dashboard' userId='user_2' />
    );

    expect(track).toHaveBeenCalledTimes(2);
    expect(track).toHaveBeenLastCalledWith(
      ONBOARDING_FUNNEL_EVENTS.DASHBOARD_LOADED,
      {
        pathname: '/app/dashboard',
        user_id: 'user_2',
      }
    );
  });
});
