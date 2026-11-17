import { TooltipProvider } from '@jovie/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ComponentPropsWithoutRef, forwardRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { DashboardData } from '@/app/app/(shell)/dashboard/actions/dashboard-data';
import { DashboardDataProvider } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import { SidebarProvider } from '@/components/organisms/sidebar';
import { APP_ROUTES } from '@/constants/routes';
import { AppFlagProvider } from '@/lib/flags/client';
import { APP_FLAG_DEFAULTS } from '@/lib/flags/contracts';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { SettingsNavigation } from './SettingsSidebarNav';

const signOutMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock('@/hooks/useJovieAuth', async importOriginal => ({
  ...(await importOriginal<typeof import('@/hooks/useJovieAuth')>()),
  useAuthSafe: () => ({ signOut: signOutMock }),
}));

vi.mock('next/link', () => ({
  default: forwardRef<
    HTMLAnchorElement,
    ComponentPropsWithoutRef<'a'> & { readonly prefetch?: boolean }
  >(function TestLink({ prefetch: _prefetch, ...props }, ref) {
    return <a {...props} ref={ref} />;
  }),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => APP_ROUTES.SETTINGS_ACCOUNT,
  useParams: () => ({}),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));

const dashboardData = {
  user: { id: 'user_123' },
  creatorProfiles: [],
  selectedProfile: { id: 'profile_123', displayName: 'Tim White' },
  needsOnboarding: false,
  sidebarCollapsed: false,
  hasSocialLinks: false,
  hasMusicLinks: false,
  isAdmin: false,
} as unknown as DashboardData;

function renderNav({
  stripeConnectEnabled = APP_FLAG_DEFAULTS.STRIPE_CONNECT_ENABLED,
  artistName,
}: {
  stripeConnectEnabled?: boolean;
  artistName?: string;
} = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <AppFlagProvider
        initialFlags={{
          ...APP_FLAG_DEFAULTS,
          STRIPE_CONNECT_ENABLED: stripeConnectEnabled,
        }}
      >
        <DashboardDataProvider
          value={
            artistName && dashboardData.selectedProfile
              ? {
                  ...dashboardData,
                  selectedProfile: {
                    ...dashboardData.selectedProfile,
                    displayName: artistName,
                  },
                }
              : dashboardData
          }
        >
          <TooltipProvider>
            <SidebarProvider>
              <SettingsNavigation
                pathname={APP_ROUTES.SETTINGS_ACCOUNT}
                section='settings'
              />
            </SidebarProvider>
          </TooltipProvider>
        </DashboardDataProvider>
      </AppFlagProvider>
    </QueryClientProvider>
  );
}

describe('SettingsNavigation', () => {
  it('keeps logout reachable by keyboard even when search has no matching settings', async () => {
    signOutMock.mockClear();
    renderNav();
    const user = userEvent.setup();
    await user.type(
      screen.getByRole('searchbox', { name: 'Search Settings' }),
      'zzz'
    );
    const signOut = screen.getByRole('button', { name: 'Sign Out' });
    signOut.focus();
    await user.keyboard('{Enter}');
    expect(signOutMock).toHaveBeenCalledTimes(1);
  });
  it('lists Personal first, then the artist area, with one active item', async () => {
    const { container } = renderNav();
    const nav = screen.getByRole('navigation', { name: 'settings navigation' });
    const labels = within(nav)
      .getAllByText(/^(Personal|Artist)$/)
      .map(node => node.textContent);
    expect(labels).toEqual(['Personal', 'Artist']);
    expect(within(nav).getByRole('link', { name: /Tim White/ })).toBeVisible();
    expect(
      within(nav)
        .getAllByRole('link')
        .filter(link => link.getAttribute('aria-current') === 'page')
        .map(link => link.getAttribute('href'))
    ).toEqual([APP_ROUTES.SETTINGS_ACCOUNT]);
    await expectNoA11yViolations(container);
  });

  it('filters destinations by name and job as the viewer types', async () => {
    renderNav();
    const search = screen.getByRole('searchbox', { name: 'Search Settings' });

    await userEvent.type(search, 'billing');
    const nav = screen.getByRole('navigation', { name: 'settings navigation' });
    expect(
      within(nav).getByRole('link', { name: /Billing & Subscription/ })
    ).toBeVisible();
    expect(
      within(nav).queryByRole('link', { name: /Touring/ })
    ).not.toBeInTheDocument();
    expect(within(nav).queryByText('Artist')).not.toBeInTheDocument();
    expect(search).toHaveValue('billing');

    await userEvent.clear(search);
    await userEvent.type(search, 'synchronization');
    expect(within(nav).queryByText('Personal')).not.toBeInTheDocument();
    expect(within(nav).getByRole('link', { name: /Touring/ })).toBeVisible();

    await userEvent.clear(search);
    await userEvent.type(search, 'zzz-no-such-setting');
    expect(screen.getByRole('status')).toHaveTextContent('No settings match');
    expect(search).toHaveFocus();
  });

  it('matches reordered words across the visible name and job while retaining input focus', async () => {
    renderNav();
    const search = screen.getByRole('searchbox', { name: 'Search Settings' });
    const nav = screen.getByRole('navigation', { name: 'settings navigation' });

    for (const query of ['subscription billing', 'terms billing']) {
      await userEvent.clear(search);
      await userEvent.type(search, query);
      expect(within(nav).getAllByRole('link')).toHaveLength(1);
      expect(
        within(nav).getByRole('link', { name: /Billing & Subscription/ })
      ).toHaveAttribute('href', APP_ROUTES.SETTINGS_BILLING);
      expect(search).toHaveFocus();
      expect(search).toHaveValue(query);
    }

    for (const query of ['billing nonsense', '!!!']) {
      await userEvent.clear(search);
      await userEvent.type(search, query);
      expect(within(nav).queryByRole('link')).not.toBeInTheDocument();
      expect(screen.getByRole('status')).toHaveTextContent('No settings match');
      expect(search).toHaveFocus();
    }
    await userEvent.clear(search);
    expect(within(nav).getAllByRole('link').length).toBeGreaterThan(1);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(search).toHaveFocus();
  });

  it.each([false, true])(
    'keeps Payments search gated when Stripe Connect is %s',
    async stripeConnectEnabled => {
      renderNav({ stripeConnectEnabled });
      const search = screen.getByRole('searchbox', { name: 'Search Settings' });
      const nav = screen.getByRole('navigation', {
        name: 'settings navigation',
      });

      if (stripeConnectEnabled) {
        const links = within(nav).getAllByRole('link');
        const billingIndex = links.findIndex(
          link => link.getAttribute('href') === APP_ROUTES.SETTINGS_BILLING
        );
        expect(links[billingIndex + 1]).toHaveAccessibleName('Payments');
      } else {
        expect(
          within(nav).queryByRole('link', { name: 'Payments' })
        ).not.toBeInTheDocument();
      }

      await userEvent.type(search, 'setup payout');
      if (stripeConnectEnabled) {
        expect(within(nav).getAllByRole('link')).toHaveLength(1);
        expect(
          within(nav).getByRole('link', { name: 'Payments' })
        ).toBeVisible();
      } else {
        expect(within(nav).queryByRole('link')).not.toBeInTheDocument();
        expect(screen.getByRole('status')).toHaveTextContent(
          'No settings match'
        );
      }
      expect(search).toHaveFocus();
    }
  );

  it('finds an accented synthetic artist label and its existing Profile destination', async () => {
    renderNav({ artistName: 'Beyoncé 東京' });
    const search = screen.getByRole('searchbox', { name: 'Search Settings' });
    const nav = screen.getByRole('navigation', { name: 'settings navigation' });
    const originalLink = within(nav).getByRole('link', {
      name: 'Beyoncé 東京',
    });

    await userEvent.type(search, 'beyonce 東京');
    expect(within(nav).getAllByRole('link')).toEqual([originalLink]);
    expect(search).toHaveFocus();

    await userEvent.clear(search);
    await userEvent.type(search, 'public profile');
    expect(within(nav).getAllByRole('link')).toEqual([originalLink]);
  });
});
