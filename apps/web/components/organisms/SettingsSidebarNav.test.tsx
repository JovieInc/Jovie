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

function renderNav() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <AppFlagProvider initialFlags={APP_FLAG_DEFAULTS}>
        <DashboardDataProvider value={dashboardData}>
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

    await userEvent.clear(search);
    await userEvent.type(search, 'zzz-no-such-setting');
    expect(screen.getByRole('status')).toHaveTextContent('No settings match');
    expect(search).toHaveFocus();
  });
});
