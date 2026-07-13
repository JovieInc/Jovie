import { render, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  inboxNavItem,
  mobileExpandedNavigation,
  mobilePrimaryNavigation,
} from '@/features/dashboard/dashboard-nav';
import { AppFlagProvider } from '@/lib/flags/client';
import { APP_FLAG_DEFAULTS, type AppFlagSnapshot } from '@/lib/flags/contracts';
import { DashboardMobileTabs } from './DashboardMobileTabs';

const { mockUsePathname, mockSignOut } = vi.hoisted(() => ({
  mockUsePathname: vi.fn<() => string>(() => '/app/chat'),
  mockSignOut: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => mockUsePathname(),
}));

vi.mock('@/app/app/(shell)/dashboard/DashboardDataContext', () => ({
  useDashboardData: () => ({ isAdmin: false }),
}));

vi.mock('@/hooks/useClerkSafe', () => ({
  useAuthSafe: () => ({ signOut: mockSignOut }),
}));

function renderMobileTabs(appFlags: Partial<AppFlagSnapshot> = {}) {
  return render(
    <AppFlagProvider initialFlags={{ ...APP_FLAG_DEFAULTS, ...appFlags }}>
      <DashboardMobileTabs />
    </AppFlagProvider>
  );
}

function bottomBar(container: HTMLElement) {
  return within(container).getByRole('navigation', {
    name: 'Dashboard Tabs',
  });
}

function expandedMenu(container: HTMLElement) {
  return within(container).getByRole('navigation', {
    name: 'Expanded Navigation Menu',
  });
}

afterEach(() => {
  mockUsePathname.mockReset();
  mockUsePathname.mockReturnValue('/app/chat');
});

describe('DashboardMobileTabs', () => {
  it('renders the bottom tab bar from the canonical mobilePrimaryNavigation config (flag off)', () => {
    const { baseElement } = renderMobileTabs();

    const links = within(bottomBar(baseElement)).getAllByRole('link');
    expect(links.map(link => link.getAttribute('href'))).toEqual(
      mobilePrimaryNavigation.map(item => item.href)
    );
    expect(links.map(link => link.textContent)).toEqual(
      mobilePrimaryNavigation.map(item => item.name)
    );
  });

  it('prepends the config Inbox item to the bottom bar when INBOX_HOME is on', () => {
    const { baseElement } = renderMobileTabs({ INBOX_HOME: true });

    const links = within(bottomBar(baseElement)).getAllByRole('link');
    expect(links.map(link => link.getAttribute('href'))).toEqual(
      [inboxNavItem, ...mobilePrimaryNavigation].map(item => item.href)
    );
    expect(links[0].textContent).toBe(inboxNavItem.name);
  });

  it('renders the expanded menu from the canonical config lists only', () => {
    const { baseElement } = renderMobileTabs();

    const links = within(expandedMenu(baseElement)).getAllByRole('link');
    // Expanded overlay lists primary + expanded items (then admin/sign-out,
    // which are not config nav links).
    expect(links.map(link => link.getAttribute('href'))).toEqual(
      [...mobilePrimaryNavigation, ...mobileExpandedNavigation].map(
        item => item.href
      )
    );
  });

  it('marks Inbox active on exactly /app (desktop parity)', () => {
    mockUsePathname.mockReturnValue('/app');
    const { baseElement } = renderMobileTabs({ INBOX_HOME: true });

    const inboxLink = within(bottomBar(baseElement)).getByRole('link', {
      name: inboxNavItem.name,
    });
    expect(inboxLink.getAttribute('aria-current')).toBe('page');
  });

  it('does not mark Inbox active on /app/* subroutes (exact match only)', () => {
    mockUsePathname.mockReturnValue('/app/calendar');
    const { baseElement } = renderMobileTabs({ INBOX_HOME: true });

    const inboxLink = within(bottomBar(baseElement)).getByRole('link', {
      name: inboxNavItem.name,
    });
    expect(inboxLink.getAttribute('aria-current')).toBeNull();
  });

  it('keeps the bottom bar at four slots max even with Inbox enabled', () => {
    const { baseElement } = renderMobileTabs({ INBOX_HOME: true });

    const links = within(bottomBar(baseElement)).getAllByRole('link');
    // Layout-shift guard: the bar renders `slice(0, 4)` fixed-height rows, so
    // the flag flipping on must not push any config item out of the bar.
    expect(links.length).toBeLessThanOrEqual(4);
    expect(links.length).toBe(1 + mobilePrimaryNavigation.length);
  });
});
