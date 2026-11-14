import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';

const mocks = vi.hoisted(() => ({
  track: vi.fn(),
  consumeSignupFirstValue: vi.fn(),
}));

vi.mock('@/lib/analytics', () => ({ track: mocks.track }));
vi.mock('@/lib/analytics/signup-funnel-client', () => ({
  consumeSignupFirstValue: mocks.consumeSignupFirstValue,
}));

import { DashboardLoadTracker } from './DashboardLoadTracker';

const KEY = 'jovie:dashboard_loaded:user-1';

describe('DashboardLoadTracker', () => {
  beforeEach(() => {
    sessionStorage.clear();
    mocks.track.mockClear();
    mocks.consumeSignupFirstValue.mockClear();
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
});
