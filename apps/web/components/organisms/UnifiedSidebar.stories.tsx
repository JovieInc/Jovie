import { RenderedSidebarFamily } from '@/.storybook/rendered-family';
import '../../styles/system-b-app.css';
import { TooltipProvider } from '@jovie/ui';
import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { withSignedInSession } from '@/.storybook/signed-in-session';
import type { DashboardData } from '@/app/app/(shell)/dashboard/actions/dashboard-data';
import { DashboardDataProvider } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import { SidebarCollapseButton } from '@/components/molecules/sidebar-collapse-button';
import { SidebarProvider, useSidebar } from '@/components/organisms/sidebar';
import { APP_ROUTES } from '@/constants/routes';
import { HeaderActionsProvider } from '@/contexts/HeaderActionsContext';
import { ShellSidebarOverrideProvider } from '@/contexts/ShellSidebarOverrideContext';
import { JovieAuthValuesProvider } from '@/hooks/useJovieAuth';
import { AppFlagProvider } from '@/lib/flags/client';
import { APP_FLAG_DEFAULTS } from '@/lib/flags/contracts';
import { queryKeys } from '@/lib/queries/keys';
import { UnifiedSidebar } from './UnifiedSidebar';

function StorySidebarProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <SidebarProvider open={open} onOpenChange={setOpen}>
      {children}
    </SidebarProvider>
  );
}

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

queryClient.setQueryData(queryKeys.chat.conversations(), [
  {
    id: 'merch',
    title: 'Merch drop checklist',
    updatedAt: new Date(Date.now() - 120_000).toISOString(),
    latestTurnStatus: 'completed',
  },
  {
    id: 'tour',
    title: 'Tour announce — caption drafts',
    updatedAt: new Date(Date.now() - 3_600_000).toISOString(),
    latestTurnStatus: 'completed',
  },
  {
    id: 'fans',
    title: 'Fan segment Q3 planning',
    updatedAt: new Date(Date.now() - 86_400_000).toISOString(),
    latestTurnStatus: 'completed',
  },
]);

const dashboardData: DashboardData = {
  user: { id: 'story-user' },
  creatorProfiles: [
    {
      id: 'story-profile',
      avatarUrl: null,
      displayName: 'Tim White',
      username: 'timwhite',
      usernameNormalized: 'timwhite',
    } as DashboardData['creatorProfiles'][number],
  ],
  selectedProfile: {
    id: 'story-profile',
    avatarUrl: null,
    displayName: 'Tim White',
    username: 'timwhite',
    usernameNormalized: 'timwhite',
  } as DashboardData['selectedProfile'],
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
  inboxNavigation: { state: 'empty', pendingCount: 0 },
};

const meta: Meta<typeof UnifiedSidebar> = {
  title: 'Organisms/UnifiedSidebar',
  component: UnifiedSidebar,
  parameters: {
    layout: 'fullscreen',
  },
  decorators: [
    withSignedInSession,
    Story => (
      <QueryClientProvider client={queryClient}>
        <AppFlagProvider initialFlags={APP_FLAG_DEFAULTS}>
          <DashboardDataProvider value={dashboardData}>
            <TooltipProvider>
              <StorySidebarProvider>
                <JovieAuthValuesProvider>
                  <HeaderActionsProvider>
                    <ShellSidebarOverrideProvider>
                      <RenderedSidebarFamily
                        name='unified-sidebar'
                        owner='UnifiedSidebar'
                      >
                        <div className='h-screen w-(--app-shell-sidebar-width)'>
                          <Story />
                        </div>
                      </RenderedSidebarFamily>
                    </ShellSidebarOverrideProvider>
                  </HeaderActionsProvider>
                </JovieAuthValuesProvider>
              </StorySidebarProvider>
            </TooltipProvider>
          </DashboardDataProvider>
        </AppFlagProvider>
      </QueryClientProvider>
    ),
  ],
  args: {
    section: 'dashboard',
    variant: 'jovie',
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Dashboard: Story = {};

export const LegacyAdmin: Story = {
  args: { section: 'admin' },
  parameters: {
    nextjs: { navigation: { pathname: APP_ROUTES.LEGACY_ADMIN } },
  },
};

export const Demo: Story = {
  parameters: { nextjs: { navigation: { pathname: APP_ROUTES.DEMO } } },
};

export const Settings: Story = {
  args: {
    section: 'settings',
  },
};

export const Operator: Story = {
  parameters: { nextjs: { navigation: { pathname: APP_ROUTES.ADMIN_CHAT } } },
  args: {
    section: 'ov',
    variant: 'ov',
  },
};

// The application header owns reopening when its rail control stages out.
// Keep that ownership in the fixture while exercising the admin brand path.
function HeaderOwnedCollapsedToggle() {
  const { open } = useSidebar();
  return open ? null : (
    <div
      className='absolute z-20 px-2'
      style={{ left: 'var(--sidebar-width-icon)', top: 'var(--space-2)' }}
    >
      <SidebarCollapseButton />
    </div>
  );
}

const adminShellDecorator: Decorator = Story => (
  <DashboardDataProvider value={{ ...dashboardData, isAdmin: true }}>
    <Story />
    <HeaderOwnedCollapsedToggle />
  </DashboardDataProvider>
);

export const AdminDashboard: Story = {
  args: { headerOwnsCollapsedToggle: true },
  decorators: [adminShellDecorator],
};

export const AdminOperator: Story = {
  ...Operator,
  args: { ...Operator.args, headerOwnsCollapsedToggle: true },
  decorators: [adminShellDecorator],
};
