import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';

const { privacyState } = vi.hoisted(() => ({ privacyState: vi.fn() }));
vi.mock('@/lib/workspace-lock/workspace-lock', async () => ({
  ...(await vi.importActual<
    typeof import('@/lib/workspace-lock/workspace-lock')
  >('@/lib/workspace-lock/workspace-lock')),
  getWorkspacePrivacyLockState: privacyState,
}));
// The full signed-in shell (sidebar, header, rails) is certified on its own;
// here it is a landmark so axe judges the boundary's own output.
vi.mock('@/components/organisms/AuthShellWrapper', () => ({
  AuthShellWrapper: ({
    children,
    isWorkspaceLocked,
  }: {
    children: React.ReactNode;
    isWorkspaceLocked: boolean;
  }) => <main data-locked={String(isWorkspaceLocked)}>{children}</main>,
}));

import { WorkspacePrivacyLockError } from '@/lib/workspace-lock/workspace-lock';
import { DashboardShellPrivacyBoundary } from './DashboardShellPrivacyBoundary';
import type { DashboardData } from './dashboard/actions/dashboard-data';

const data = {
  user: { id: 'user-1' },
  creatorProfiles: [],
  selectedProfile: null,
  needsOnboarding: false,
  sidebarCollapsed: false,
  hasSocialLinks: false,
  hasMusicLinks: false,
  isAdmin: false,
  tippingStats: {
    tipClicks: 0,
    qrTipClicks: 0,
    linkTipClicks: 0,
    tipsSubmitted: 0,
    totalReceivedCents: 0,
    monthReceivedCents: 0,
  },
  profileCompletion: {
    percentage: 0,
    completedCount: 0,
    totalCount: 0,
    steps: [],
    profileIsLive: false,
  },
} satisfies DashboardData;

function renderBoundary(
  overrides: Partial<
    React.ComponentProps<typeof DashboardShellPrivacyBoundary>
  > = {}
) {
  return render(
    <DashboardShellPrivacyBoundary
      mode='customer'
      userId='user-1'
      dashboardData={data}
      initiallyLocked={false}
      privacyEnabled={false}
      lockedUntil={null}
      sidebarDefaultOpen
      previewPanelDefaultOpen={false}
      persistSidebarCollapsed={async () => {}}
      unlockedShellChrome={<p>Private shell chrome</p>}
      {...overrides}
    >
      {overrides.children ?? <p>Private page content</p>}
    </DashboardShellPrivacyBoundary>
  );
}

describe('DashboardShellPrivacyBoundary certificate', () => {
  beforeEach(() => {
    privacyState.mockReset();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the unlocked shell with its route and chrome, axe-clean', async () => {
    const { container } = renderBoundary();

    expect(screen.getByRole('main')).toHaveAttribute('data-locked', 'false');
    expect(screen.getByText('Private page content')).toBeInTheDocument();
    expect(screen.getByText('Private shell chrome')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('renders nothing when there is no dashboard data to provide', () => {
    const { container } = renderBoundary({ dashboardData: null });

    expect(container).toBeEmptyDOMElement();
  });

  it('shows only the unlock screen when Ovie starts locked, axe-clean', async () => {
    const { container } = renderBoundary({
      mode: 'ov',
      initiallyLocked: true,
      privacyEnabled: true,
    });

    expect(screen.getByRole('main')).toHaveAttribute('data-locked', 'true');
    expect(screen.queryByText('Private page content')).not.toBeInTheDocument();
    expect(screen.queryByText('Private shell chrome')).not.toBeInTheDocument();
    expect(screen.getAllByRole('button').length).toBeGreaterThan(0);
    await expectNoA11yViolations(container);
  });

  it('fails closed with an accessible retry when the lock check fails', async () => {
    privacyState.mockRejectedValue(
      new WorkspacePrivacyLockError('offline', 'timeout')
    );
    const { container } = renderBoundary({
      mode: 'ov',
      privacyEnabled: true,
      lockedUntil: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    });

    await act(async () => window.dispatchEvent(new Event('focus')));

    expect(screen.getByRole('status')).toHaveTextContent(
      'Reconnecting to Ovie…'
    );
    expect(screen.queryByText('Private page content')).not.toBeInTheDocument();
    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    );
    expect(privacyState).toHaveBeenCalledTimes(2);
    await expectNoA11yViolations(container);
  });

  it('keeps long and right-to-left route content axe-clean', async () => {
    const lines = Array.from(
      { length: 30 },
      (_, index) => `Message ${index + 1}`
    );
    const { container } = renderBoundary({
      children: (
        <div dir='rtl' lang='ar'>
          <p>مرحبا بك في مساحة العمل</p>
          {lines.map(line => (
            <p key={line}>{line}</p>
          ))}
        </div>
      ),
    });

    expect(screen.getByText('مرحبا بك في مساحة العمل')).toBeInTheDocument();
    expect(screen.getByText('Message 30')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
