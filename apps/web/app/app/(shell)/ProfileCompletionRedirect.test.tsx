import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';
import { expectNoA11yViolations } from '@/tests/utils/a11y';

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  dashboard: {} as Record<string, unknown>,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace }),
}));
vi.mock('@/app/app/(shell)/dashboard/DashboardDataContext', () => ({
  useDashboardData: () => mocks.dashboard,
}));

import { ProfileCompletionRedirect } from './ProfileCompletionRedirect';

const COMPLETE_PROFILE = {
  id: 'profile-1',
  username: 'sashawaves',
  usernameNormalized: 'sashawaves',
  displayName: 'Sasha Waves',
  isPublic: true,
  onboardingCompletedAt: new Date('2026-01-02T00:00:00.000Z'),
};

function mount(dashboard: Record<string, unknown>) {
  mocks.dashboard = {
    selectedProfile: null,
    dashboardLoadError: null,
    isAdmin: false,
    ...dashboard,
  };
  return render(<ProfileCompletionRedirect />);
}

describe('ProfileCompletionRedirect', () => {
  beforeEach(() => {
    mocks.replace.mockClear();
  });

  it('keeps a finished profile on the route and renders nothing', async () => {
    const { container } = mount({ selectedProfile: COMPLETE_PROFILE });
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(container).toBeEmptyDOMElement();
    await expectNoA11yViolations(container);
  });

  it('sends a signed-in user with no profile to onboarding', async () => {
    const { container } = mount({ selectedProfile: null });
    expect(mocks.replace).toHaveBeenCalledTimes(1);
    expect(mocks.replace).toHaveBeenCalledWith(APP_ROUTES.START);
    await expectNoA11yViolations(container);
  });

  it.each([
    ['no display name', { displayName: '  ' }],
    ['an unclaimed handle', { usernameNormalized: null }],
    ['a private page', { isPublic: false }],
    ['unfinished onboarding', { onboardingCompletedAt: null }],
  ])('sends a profile with %s to onboarding', (_label, patch) => {
    mount({ selectedProfile: { ...COMPLETE_PROFILE, ...patch } });
    expect(mocks.replace).toHaveBeenCalledWith(APP_ROUTES.START);
  });

  it('keeps a private page that is waiting on ownership proof', () => {
    mount({
      selectedProfile: {
        ...COMPLETE_PROFILE,
        isPublic: false,
        proofPending: true,
      },
    });
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it('never redirects while the dashboard read failed, which would loop', async () => {
    const { container } = mount({
      selectedProfile: null,
      dashboardLoadError: new Error('Dashboard unavailable'),
    });
    expect(mocks.replace).not.toHaveBeenCalled();
    await expectNoA11yViolations(container);
  });

  it('never redirects an admin, whatever the profile', async () => {
    const { container } = mount({ selectedProfile: null, isAdmin: true });
    expect(mocks.replace).not.toHaveBeenCalled();
    await expectNoA11yViolations(container);
  });
});
