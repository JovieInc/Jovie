import { useQueryClient } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { queryKeys } from '@/lib/queries/keys';
import { expectNoA11yViolations } from '@/tests/utils/a11y';

// The shell chrome (AuthShellWrapper) is certified on its own; here it is a
// main landmark so the wrapper's providers and seeded data are what is tested.
vi.mock('@/app/app/(shell)/dashboard/DashboardDataContext', () => ({
  DashboardDataProvider: ({ children }: { readonly children: ReactNode }) => (
    <>{children}</>
  ),
}));

vi.mock('@/components/organisms/AuthShellWrapper', () => ({
  AuthShellWrapper: ({ children }: { readonly children: ReactNode }) => (
    <main data-testid='demo-auth-shell-wrapper'>{children}</main>
  ),
}));

vi.mock('@/components/providers/NuqsProvider', () => ({
  NuqsProvider: ({ children }: { readonly children: ReactNode }) => (
    <>{children}</>
  ),
}));

vi.mock('@/hooks/useClerkSafe', () => ({
  ClerkSafeDefaultsProvider: ({
    children,
    fixtureUser,
  }: {
    readonly children: ReactNode;
    readonly fixtureUser?: { fullName: string | null } | null;
  }) => (
    <div data-testid='demo-identity' data-name={fixtureUser?.fullName ?? ''}>
      {children}
    </div>
  ),
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('./DemoPlayerCapture', () => ({
  DemoPlayerCapture: () => null,
}));

import { DemoAuthShell } from './DemoAuthShell';
import { DEMO_DASHBOARD_DATA } from './mock-dashboard-data';

function Probe() {
  const client = useQueryClient();
  const profileId = DEMO_DASHBOARD_DATA.selectedProfile?.id ?? '';
  const releases = client.getQueryData<readonly unknown[]>(
    queryKeys.releases.matrix(profileId)
  );
  const billing = client.getQueryData<{ plan: string }>(
    queryKeys.billing.status()
  );
  return (
    <section aria-label='Probe'>
      <p data-testid='release-count'>{releases?.length ?? 'none'}</p>
      <p data-testid='plan'>{billing?.plan}</p>
      <button type='button'>Open release</button>
    </section>
  );
}

describe('DemoAuthShell certificate', () => {
  it('renders children inside the shell with seeded demo data', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <DemoAuthShell>
        <Probe />
      </DemoAuthShell>
    );

    expect(screen.getByRole('main')).toContainElement(
      screen.getByRole('region', { name: 'Probe' })
    );
    expect(
      Number(screen.getByTestId('release-count').textContent)
    ).toBeGreaterThan(0);
    expect(screen.getByTestId('plan')).toHaveTextContent('max');
    await user.tab();
    expect(screen.getByRole('button', { name: 'Open release' })).toHaveFocus();
    await expectNoA11yViolations(container);
  });

  it('seeds an empty release list and lets a caller override billing', async () => {
    const { container } = render(
      <DemoAuthShell
        releasesForQuery={[]}
        seedQueryClient={client =>
          client.setQueryData(queryKeys.billing.status(), { plan: 'free' })
        }
      >
        <Probe />
      </DemoAuthShell>
    );

    expect(screen.getByTestId('release-count')).toHaveTextContent('0');
    expect(screen.getByTestId('plan')).toHaveTextContent('free');
    await expectNoA11yViolations(container);
  });

  it('falls back to the username when the profile has no display name', async () => {
    const profile = DEMO_DASHBOARD_DATA.selectedProfile;
    if (!profile) throw new Error('demo fixture has no profile');
    const { container } = render(
      <DemoAuthShell
        dashboardData={{
          ...DEMO_DASHBOARD_DATA,
          selectedProfile: { ...profile, displayName: null, avatarUrl: null },
        }}
      >
        <p>Partial profile</p>
      </DemoAuthShell>
    );

    expect(screen.getByTestId('demo-identity')).toHaveAttribute(
      'data-name',
      profile.username
    );
    await expectNoA11yViolations(container);
  });

  it('keeps long right-to-left content axe-clean', async () => {
    const long =
      'Authenticated demo chrome renders with seeded billing, release and weekly message usage data across several lines.';
    const { container } = render(
      <div dir='rtl'>
        <DemoAuthShell>
          <p>{long}</p>
        </DemoAuthShell>
      </div>
    );

    expect(screen.getByText(long)).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
