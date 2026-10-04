import { describe, expect, it } from 'vitest';
import { PROFILE_MATRIX_ROUTES } from '../../e2e/utils/profile-route-matrix';

function handleOf(path: string): string {
  const [handle] = path.split(/[/?]/).filter(Boolean);
  if (!handle) {
    throw new Error(`Expected a profile handle in ${path}`);
  }
  return handle;
}

describe('PROFILE_MATRIX_ROUTES notifications-legacy', () => {
  it('waits for the subscribe card on the claimed music handle', () => {
    const notifications = PROFILE_MATRIX_ROUTES.find(
      route => route.id === 'notifications-legacy'
    );
    const subscribe = PROFILE_MATRIX_ROUTES.find(
      route => route.id === 'subscribe'
    );
    const pay = PROFILE_MATRIX_ROUTES.find(route => route.id === 'pay');

    expect(notifications).toBeDefined();
    expect(subscribe).toBeDefined();
    expect(pay).toBeDefined();
    if (!notifications || !subscribe || !pay) return;

    expect(notifications.path).toBe(
      `/${handleOf(subscribe.path)}/notifications`
    );
    expect(handleOf(notifications.path)).not.toBe(handleOf(pay.path));
    expect(notifications.readySelectors).toEqual([
      '[data-testid="profile-primary-tab-subscribe"]',
    ]);
    expect(notifications.expectedActiveTab).toBe('profile');
    expect(notifications.showsBottomTabBar).toBe(true);
  });
});
