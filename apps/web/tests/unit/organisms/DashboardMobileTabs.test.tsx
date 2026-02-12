import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DashboardData } from '@/app/app/(shell)/dashboard/actions/dashboard-data';
import { DashboardDataProvider } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import { DashboardMobileTabs } from '@/components/dashboard/organisms/DashboardMobileTabs';
import { fastRender } from '@/tests/utils/fast-render';

const mockUsePathname = vi.fn(() => '/app/dashboard');

vi.mock('next/navigation', () => ({
  usePathname: () => mockUsePathname(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  useParams: () => ({}),
}));

const baseDashboardData: DashboardData = {
  user: { id: 'user_123' },
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
};

function renderTabs(overrides: Partial<DashboardData> = {}) {
  return fastRender(
    <DashboardDataProvider value={{ ...baseDashboardData, ...overrides }}>
      <DashboardMobileTabs />
    </DashboardDataProvider>
  );
}

describe('DashboardMobileTabs', () => {
  beforeEach(() => {
    mockUsePathname.mockReturnValue('/app/dashboard');
  });

  it('hides admin items for non-admin users', async () => {
    const user = userEvent.setup();
    const { getByRole, queryByText } = renderTabs({ isAdmin: false });

    await user.click(getByRole('button', { name: 'More options' }));

    expect(queryByText('Admin')).toBeNull();
    expect(queryByText('Waitlist')).toBeNull();
  });

  it('shows admin section and items for admin users', async () => {
    const user = userEvent.setup();
    const { getByRole, getByText } = renderTabs({ isAdmin: true });

    await user.click(getByRole('button', { name: 'More options' }));

    expect(getByText('Admin')).toBeDefined();
    expect(getByText('Waitlist')).toBeDefined();
  });
});
