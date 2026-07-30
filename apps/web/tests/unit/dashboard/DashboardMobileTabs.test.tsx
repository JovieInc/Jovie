import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DashboardMobileTabs } from '@/components/features/dashboard/organisms/DashboardMobileTabs';
import { APP_ROUTES } from '@/constants/routes';

const {
  mockPathname,
  mockSignOut,
  mockStartNavigationTelemetry,
  mockTrackNavigationImpressions,
} = vi.hoisted(() => ({
  mockPathname: vi.fn(() => APP_ROUTES.CHAT),
  mockSignOut: vi.fn(),
  mockStartNavigationTelemetry: vi.fn(),
  mockTrackNavigationImpressions: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname(),
}));

vi.mock('@/hooks/useClerkSafe', () => ({
  useAuthSafe: () => ({ signOut: mockSignOut }),
}));

vi.mock('@/hooks/useMediaQuery', () => ({ useMediaQuery: () => true }));
vi.mock('@/lib/desktop/electron-bridge', () => ({
  useIsElectronRuntime: () => false,
}));
vi.mock('@/lib/tracking/navigation-telemetry', () => ({
  navigationInputMethodFromClick: (detail: number) =>
    detail === 0 ? 'keyboard' : 'pointer',
  startNavigationTelemetry: (...args: unknown[]) =>
    mockStartNavigationTelemetry(...args),
  trackNavigationImpressions: (...args: unknown[]) =>
    mockTrackNavigationImpressions(...args),
}));

const CANONICAL_LABELS = [
  'New Chat',
  'Inbox',
  'Library',
  'Contacts',
  'Profiles',
  'Calendar',
  'Tasks',
] as const;

describe('DashboardMobileTabs', () => {
  beforeEach(() => {
    mockPathname.mockReset();
    mockPathname.mockReturnValue(APP_ROUTES.CHAT);
    mockSignOut.mockReset();
    mockStartNavigationTelemetry.mockReset();
    mockTrackNavigationImpressions.mockReset();
  });

  it('fits the first three canonical destinations behind primary plus More', () => {
    render(<DashboardMobileTabs />);

    const tabs = screen.getByRole('navigation', { name: 'Dashboard Tabs' });
    expect(tabs.parentElement).toHaveAttribute('data-layout', 'in-flow');
    expect(tabs.parentElement).not.toHaveClass('fixed');
    const directLinks = within(tabs).getAllByRole('link');

    expect(directLinks.map(link => link.textContent?.trim())).toEqual([
      'New Chat',
      'Inbox',
      'Library',
    ]);
    expect(
      within(tabs).getByRole('button', { name: 'More options' })
    ).toHaveClass('min-w-11', 'flex-1');
    expect(directLinks.every(link => link.className.includes('min-w-11'))).toBe(
      true
    );
  });

  it('tracks visible items and wires one mobile activation', async () => {
    const user = userEvent.setup();
    render(<DashboardMobileTabs />);

    expect(mockTrackNavigationImpressions).toHaveBeenCalledWith(
      ['chat', 'inbox', 'library'],
      APP_ROUTES.CHAT,
      expect.objectContaining({
        isMobile: true,
        navVariant: 'canonical_customer_ia_v1',
      })
    );
    const libraryLink = screen.getByRole('link', { name: 'Library' });
    libraryLink.addEventListener('click', event => event.preventDefault());
    await user.click(libraryLink);
    expect(mockStartNavigationTelemetry).toHaveBeenCalledExactlyOnceWith({
      itemId: 'library',
      sourcePathname: APP_ROUTES.CHAT,
      destinationHref: APP_ROUTES.LIBRARY,
      inputMethod: 'pointer',
      context: {
        isElectron: false,
        isMobile: true,
        navVariant: 'canonical_customer_ia_v1',
      },
    });
  });

  it('shows the exact seven in order, with Settings separated as utility', async () => {
    const user = userEvent.setup();
    render(<DashboardMobileTabs />);

    await user.click(screen.getByRole('button', { name: 'More options' }));
    const menu = screen.getByRole('navigation', {
      name: 'Expanded Navigation Menu',
    });
    const links = within(menu).getAllByRole('link');

    expect(links.slice(0, 7).map(link => link.textContent?.trim())).toEqual(
      CANONICAL_LABELS
    );
    expect(links.slice(0, 7).map(link => link.getAttribute('href'))).toEqual([
      APP_ROUTES.CHAT,
      APP_ROUTES.DASHBOARD,
      APP_ROUTES.LIBRARY,
      APP_ROUTES.CONTACTS,
      APP_ROUTES.PROFILES,
      APP_ROUTES.CALENDAR,
      APP_ROUTES.TASKS,
    ]);
    expect(links.at(7)).toHaveTextContent('Settings');
    expect(links.at(7)).toHaveAttribute('href', APP_ROUTES.SETTINGS);

    for (const label of ['Search', 'Touring', 'Audience', 'Releases']) {
      expect(within(menu).queryByRole('link', { name: label })).toBeNull();
    }
  });

  it('supports keyboard open and Escape close without moving the tab row', async () => {
    const user = userEvent.setup();
    render(<DashboardMobileTabs />);

    const tabs = screen.getByRole('navigation', { name: 'Dashboard Tabs' });
    const before = within(tabs)
      .getAllByRole('link')
      .map(link => link.getAttribute('href'));
    const more = within(tabs).getByRole('button', { name: 'More options' });
    more.focus();
    await user.keyboard('{Enter}');
    expect(more).toHaveAttribute('aria-expanded', 'true');

    await user.keyboard('{Escape}');
    expect(more).toHaveAttribute('aria-expanded', 'false');
    expect(
      within(tabs)
        .getAllByRole('link')
        .map(link => link.getAttribute('href'))
    ).toEqual(before);
  });

  it('marks Inbox active only at the shell root', () => {
    const chat = render(<DashboardMobileTabs />);
    const chatTabs = screen.getByRole('navigation', { name: 'Dashboard Tabs' });
    expect(
      within(chatTabs).getByRole('link', { name: 'Inbox' })
    ).not.toHaveAttribute('aria-current');
    expect(
      within(chatTabs).getByRole('link', { name: 'New Chat' })
    ).toHaveAttribute('aria-current', 'page');
    chat.unmount();

    mockPathname.mockReturnValue(APP_ROUTES.DASHBOARD);
    render(<DashboardMobileTabs />);
    const inboxTabs = screen.getByRole('navigation', {
      name: 'Dashboard Tabs',
    });
    expect(
      within(inboxTabs).getByRole('link', { name: 'Inbox' })
    ).toHaveAttribute('aria-current', 'page');
  });

  it('keeps Library active throughout a canonical release workspace', () => {
    mockPathname.mockReturnValue('/app/releases/release-123/tasks');
    render(<DashboardMobileTabs />);

    const tabs = screen.getByRole('navigation', { name: 'Dashboard Tabs' });
    expect(within(tabs).getByRole('link', { name: 'Library' })).toHaveAttribute(
      'aria-current',
      'page'
    );
  });
});
