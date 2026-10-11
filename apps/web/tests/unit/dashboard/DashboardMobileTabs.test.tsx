import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DashboardMobileTabs } from '@/components/features/dashboard/organisms/DashboardMobileTabs';
import { APP_ROUTES } from '@/constants/routes';

const {
  mockPathname,
  mockSearchParams,
  mockSignOut,
  mockProfileHref,
  mockStartNavigationTelemetry,
  mockTrackNavigationImpressions,
} = vi.hoisted(() => ({
  mockPathname: vi.fn<() => string>(() => APP_ROUTES.CHAT),
  mockSearchParams: vi.fn(() => new URLSearchParams()),
  mockSignOut: vi.fn(),
  mockProfileHref: vi.fn(() => '/timwhite'),
  mockStartNavigationTelemetry: vi.fn(),
  mockTrackNavigationImpressions: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname(),
  useSearchParams: () => mockSearchParams(),
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
  startNavigationTelemetry: (...args: unknown[]) =>
    mockStartNavigationTelemetry(...args),
  trackNavigationImpressions: (...args: unknown[]) =>
    mockTrackNavigationImpressions(...args),
}));

const EXPANDED_LABELS = ['Inbox', 'Work', 'Audience'] as const;

describe('DashboardMobileTabs', () => {
  beforeEach(() => {
    mockPathname.mockReset();
    mockPathname.mockReturnValue(APP_ROUTES.CHAT);
    mockSearchParams.mockReset();
    mockSearchParams.mockReturnValue(new URLSearchParams());
    mockSignOut.mockReset();
    mockProfileHref.mockReset();
    mockProfileHref.mockReturnValue('/timwhite');
    mockStartNavigationTelemetry.mockReset();
    mockTrackNavigationImpressions.mockReset();
  });

  it('keeps Inbox, Work, and Audience direct while Identity is flag-gated off', () => {
    render(<DashboardMobileTabs />);

    const tabs = screen.getByRole('navigation', { name: 'Dashboard Tabs' });
    expect(tabs.parentElement).toHaveAttribute('data-layout', 'in-flow');
    expect(tabs.parentElement).not.toHaveClass('fixed');
    const directLinks = within(tabs).getAllByRole('link');

    expect(directLinks.map(link => link.textContent?.trim())).toEqual([
      'Inbox',
      'Work',
      'Audience',
    ]);
    expect(within(tabs).queryByRole('link', { name: 'Identity' })).toBeNull();
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
      ['home', 'library', 'audience'],
      APP_ROUTES.CHAT,
      expect.objectContaining({
        isMobile: true,
        navVariant: 'canonical_identity_work_v1',
      })
    );
    await user.click(screen.getByRole('button', { name: 'More options' }));
    const audienceLink = screen.getByRole('link', { name: 'Audience' });
    audienceLink.addEventListener('click', event => event.preventDefault());
    await user.click(audienceLink);
    expect(mockStartNavigationTelemetry).toHaveBeenCalledExactlyOnceWith({
      itemId: 'audience',
      sourcePathname: APP_ROUTES.CHAT,
      destinationHref: APP_ROUTES.CONTACTS_AUDIENCE,
      inputMethod: 'pointer',
      context: {
        isElectron: false,
        isMobile: true,
        navVariant: 'canonical_identity_work_v1',
      },
    });
  });

  it('shows the exact expanded destinations in order, with account utilities separated', async () => {
    const user = userEvent.setup();
    render(<DashboardMobileTabs />);

    await user.click(screen.getByRole('button', { name: 'More options' }));
    const menu = screen.getByRole('navigation', {
      name: 'Expanded Navigation Menu',
    });
    const links = within(menu).getAllByRole('link');

    expect(links.slice(0, 3).map(link => link.textContent?.trim())).toEqual(
      EXPANDED_LABELS
    );
    expect(links.slice(0, 3).map(link => link.getAttribute('href'))).toEqual([
      APP_ROUTES.DASHBOARD,
      APP_ROUTES.LIBRARY,
      APP_ROUTES.CONTACTS_AUDIENCE,
    ]);
    expect(within(menu).queryByRole('link', { name: 'Identity' })).toBeNull();
    expect(links.at(3)).toHaveTextContent('Public Profile');
    expect(links.at(3)).toHaveAttribute('href', '/timwhite');
    expect(links.at(4)).toHaveTextContent('Settings');
    expect(links.at(4)).toHaveAttribute('href', APP_ROUTES.SETTINGS);

    for (const label of [
      'Events',
      'Library',
      'Links',
      'Products',
      'Releases',
      'Tasks',
      'Videos',
    ]) {
      expect(within(menu).queryByRole('link', { name: label })).toBeNull();
    }
  });

  it('closes More when a query-backed destination keeps the same pathname', async () => {
    mockPathname.mockReturnValue(APP_ROUTES.CONTACTS);
    mockSearchParams.mockReturnValue(new URLSearchParams());
    const user = userEvent.setup();
    render(<DashboardMobileTabs />);

    await user.click(screen.getByRole('button', { name: 'More options' }));
    const audienceLink = screen.getByRole('link', { name: 'Audience' });
    audienceLink.addEventListener('click', event => event.preventDefault());
    await user.click(audienceLink);

    expect(
      screen.queryByRole('dialog', { name: 'Expanded Navigation Menu' })
    ).not.toBeInTheDocument();
    expect(mockStartNavigationTelemetry).toHaveBeenCalledWith(
      expect.objectContaining({
        itemId: 'audience',
        sourcePathname: APP_ROUTES.CONTACTS,
        destinationHref: APP_ROUTES.CONTACTS_AUDIENCE,
      })
    );
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

  it('treats More as a modal mobile surface with contained focus and inert background', async () => {
    const user = userEvent.setup();
    render(
      <>
        <button type='button'>Background action</button>
        <DashboardMobileTabs />
      </>
    );

    const more = screen.getByRole('button', { name: 'More options' });
    await user.click(more);

    const dialog = screen.getByRole('dialog', {
      name: 'Expanded Navigation Menu',
    });
    const menu = within(dialog).getByRole('navigation', {
      name: 'Expanded Navigation Menu',
    });
    const first = within(menu).getByRole('link', { name: 'Inbox' });
    const last = within(dialog).getByRole('button', { name: 'Sign out' });
    const background = screen.getByText('Background action');

    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(more).toHaveAttribute('aria-controls', dialog.id);
    expect(first).toHaveFocus();
    expect(background.inert).toBe(true);

    last.focus();
    await user.tab();
    expect(first).toHaveFocus();

    first.focus();
    await user.tab({ shift: true });
    expect(last).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(
      screen.queryByRole('dialog', { name: 'Expanded Navigation Menu' })
    ).not.toBeInTheDocument();
    expect(background.inert).toBeFalsy();
    await waitFor(() => expect(more).toHaveFocus());
  });

  it('marks Inbox active only at the shell root', () => {
    const chat = render(<DashboardMobileTabs />);
    const chatTabs = screen.getByRole('navigation', { name: 'Dashboard Tabs' });
    expect(
      within(chatTabs).getByRole('link', { name: 'Inbox' })
    ).not.toHaveAttribute('aria-current');
    chat.unmount();

    mockPathname.mockReturnValue(APP_ROUTES.DASHBOARD);
    render(<DashboardMobileTabs />);
    const homeTabs = screen.getByRole('navigation', {
      name: 'Dashboard Tabs',
    });
    expect(
      within(homeTabs).getByRole('link', { name: 'Inbox' })
    ).toHaveAttribute('aria-current', 'page');
  });

  it.each([
    [APP_ROUTES.CONTACTS, 'tab=audience'],
    [APP_ROUTES.INSIGHTS, ''],
  ])('promotes Audience into the tab row for %s', (pathname, search) => {
    mockPathname.mockReturnValue(pathname);
    mockSearchParams.mockReturnValue(new URLSearchParams(search));
    render(<DashboardMobileTabs />);

    const tabs = screen.getByRole('navigation', { name: 'Dashboard Tabs' });
    const directLinks = within(tabs).getAllByRole('link');
    expect(directLinks.map(link => link.textContent?.trim())).toEqual([
      'Inbox',
      'Work',
      'Audience',
    ]);
    expect(
      within(tabs).getByRole('link', { name: 'Audience' })
    ).toHaveAttribute('aria-current', 'page');
  });
});
