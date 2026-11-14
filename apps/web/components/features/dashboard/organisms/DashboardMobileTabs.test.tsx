import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { DashboardMobileTabs } from './DashboardMobileTabs';

const { mockSignOut, mockProfileHref } = vi.hoisted(() => ({
  mockSignOut: vi.fn(),
  mockProfileHref: vi.fn<() => string | null>(() => '/timwhite'),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => APP_ROUTES.CHAT,
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/hooks/useClerkSafe', () => ({
  useAuthSafe: () => ({ signOut: mockSignOut }),
}));
vi.mock('@/hooks/useMediaQuery', () => ({ useMediaQuery: () => true }));
vi.mock('@/hooks/useProfileData', () => ({
  useProfileData: () => ({ profileHref: mockProfileHref() }),
}));
vi.mock('@/lib/desktop/electron-bridge', () => ({
  useIsElectronRuntime: () => false,
}));
vi.mock('@/lib/tracking/navigation-telemetry', () => ({
  NAVIGATION_DROP_OFF_MS: 10_000,
  navigationInputMethodFromClick: (detail: number) =>
    detail === 0 ? 'keyboard' : 'pointer',
  startNavigationTelemetry: vi.fn(),
  trackNavigationImpressions: vi.fn(),
}));

describe('DashboardMobileTabs', () => {
  beforeEach(() => {
    mockSignOut.mockReset();
    mockProfileHref.mockReset();
    mockProfileHref.mockReturnValue('/timwhite');
  });

  it('has no axe violations in the tab bar or the expanded menu', async () => {
    const user = userEvent.setup();
    const { container } = render(<DashboardMobileTabs />);
    expect(
      screen.getByRole('navigation', { name: 'Dashboard Tabs' })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);

    await user.click(screen.getByRole('button', { name: 'More options' }));
    const dialog = screen.getByRole('dialog', {
      name: 'Expanded Navigation Menu',
    });
    expect(
      within(dialog).getByRole('link', { name: 'Public Profile' })
    ).toHaveAttribute('href', '/timwhite');
    await expectNoA11yViolations(document.body);
  });

  it('signs out to the home page from the expanded menu', async () => {
    const user = userEvent.setup();
    render(<DashboardMobileTabs />);
    await user.click(screen.getByRole('button', { name: 'More options' }));
    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(mockSignOut).toHaveBeenCalledExactlyOnceWith({ redirectUrl: '/' });
  });

  it('leaves the public profile link out until the profile has a URL', async () => {
    mockProfileHref.mockReturnValue(null);
    const user = userEvent.setup();
    render(<DashboardMobileTabs />);
    await user.click(screen.getByRole('button', { name: 'More options' }));
    expect(screen.queryByRole('link', { name: 'Public Profile' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeVisible();
  });

  it('stays accessible right to left', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <DashboardMobileTabs />
      </div>
    );
    expect(
      within(
        screen.getByRole('navigation', { name: 'Dashboard Tabs' })
      ).getAllByRole('link')
    ).toHaveLength(3);
    await expectNoA11yViolations(container);
  });
});
