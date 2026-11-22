import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';

const mocks = vi.hoisted(() => ({
  track: vi.fn(),
  consumeSignupFirstValue: vi.fn(),
  peekSignupFirstValuePending: vi.fn(() => false),
  watchFirstDashboardReady: vi.fn(() => () => {}),
}));

vi.mock('@/lib/analytics', () => ({ track: mocks.track }));
vi.mock('@/lib/analytics/signup-funnel-client', () => ({
  consumeSignupFirstValue: mocks.consumeSignupFirstValue,
  peekSignupFirstValuePending: mocks.peekSignupFirstValuePending,
}));
vi.mock('@/lib/monitoring/first-dashboard-ready', async importOriginal => ({
  ...(await importOriginal<
    typeof import('@/lib/monitoring/first-dashboard-ready')
  >()),
  watchFirstDashboardReady: mocks.watchFirstDashboardReady,
}));

import {
  DashboardLoadTracker,
  resetFirstDashboardProbeForTests,
} from './DashboardLoadTracker';

const KEY = 'jovie:dashboard_loaded:user-1';

describe('DashboardLoadTracker', () => {
  beforeEach(() => {
    sessionStorage.clear();
    mocks.track.mockClear();
    mocks.consumeSignupFirstValue.mockClear();
    mocks.peekSignupFirstValuePending.mockReset().mockReturnValue(false);
    mocks.watchFirstDashboardReady.mockClear();
    resetFirstDashboardProbeForTests();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('tracks one dashboard load per user per session and renders nothing', async () => {
    const { container, rerender } = render(
      <DashboardLoadTracker pathname='/app/chat' userId='user-1' />
    );

    expect(container).toBeEmptyDOMElement();
    expect(mocks.consumeSignupFirstValue).toHaveBeenCalledTimes(1);
    expect(mocks.track).toHaveBeenCalledTimes(1);
    expect(mocks.track).toHaveBeenCalledWith('dashboard_loaded', {
      pathname: '/app/chat',
      user_id: 'user-1',
    });
    expect(sessionStorage.getItem(KEY)).toBe('1');

    // A client navigation inside the shell re-renders with a new pathname.
    rerender(<DashboardLoadTracker pathname='/app/library' userId='user-1' />);
    expect(mocks.track).toHaveBeenCalledTimes(1);
    expect(mocks.consumeSignupFirstValue).toHaveBeenCalledTimes(1);

    await expectNoA11yViolations(container);
  });

  it('skips the event when this session already recorded the load', async () => {
    sessionStorage.setItem(KEY, '1');
    const { container } = render(
      <DashboardLoadTracker pathname='/app' userId='user-1' />
    );
    expect(mocks.track).not.toHaveBeenCalled();
    expect(mocks.consumeSignupFirstValue).toHaveBeenCalledTimes(1);
    await expectNoA11yViolations(container);
  });

  it('tracks a different user signed in on the same tab', () => {
    sessionStorage.setItem(KEY, '1');
    const { rerender } = render(
      <DashboardLoadTracker pathname='/app' userId='user-1' />
    );
    rerender(<DashboardLoadTracker pathname='/app' userId='user-2' />);
    expect(mocks.track).toHaveBeenCalledTimes(1);
    expect(mocks.track).toHaveBeenCalledWith('dashboard_loaded', {
      pathname: '/app',
      user_id: 'user-2',
    });
  });

  it('still tracks once when session storage throws', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    const { container, rerender } = render(
      <DashboardLoadTracker pathname='/app' userId='user-1' />
    );
    rerender(<DashboardLoadTracker pathname='/app/chat' userId='user-1' />);
    expect(mocks.track).toHaveBeenCalledTimes(1);
    expect(container).toBeEmptyDOMElement();
    await expectNoA11yViolations(container);
  });

  it('starts the first-dashboard probe once per hard load', async () => {
    mocks.peekSignupFirstValuePending.mockReturnValue(true);
    const { rerender, unmount } = render(
      <DashboardLoadTracker pathname='/app' userId='user-1' />
    );
    await vi.waitFor(() =>
      expect(mocks.watchFirstDashboardReady).toHaveBeenCalledTimes(1)
    );
    expect(mocks.watchFirstDashboardReady).toHaveBeenCalledWith(
      expect.objectContaining({ newAccount: true })
    );
    // The flag is read before the first-value marker is consumed.
    expect(
      mocks.peekSignupFirstValuePending.mock.invocationCallOrder[0]
    ).toBeLessThan(mocks.consumeSignupFirstValue.mock.invocationCallOrder[0]);

    rerender(<DashboardLoadTracker pathname='/app/chat' userId='user-1' />);
    unmount();
    render(<DashboardLoadTracker pathname='/app' userId='user-1' />);
    await vi.dynamicImportSettled();
    expect(mocks.watchFirstDashboardReady).toHaveBeenCalledTimes(1);
  });

  it('skips the probe on a reload or back-forward load', async () => {
    vi.spyOn(performance, 'getEntriesByType').mockReturnValue([
      { type: 'reload' } as unknown as PerformanceNavigationTiming,
    ]);
    render(<DashboardLoadTracker pathname='/app' userId='user-1' />);
    await vi.dynamicImportSettled();
    expect(mocks.watchFirstDashboardReady).not.toHaveBeenCalled();
  });
});
