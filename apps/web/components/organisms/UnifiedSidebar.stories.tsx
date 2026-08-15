import { TooltipProvider } from '@jovie/ui';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { DashboardData } from '@/app/app/(shell)/dashboard/actions/dashboard-data';
import { DashboardDataProvider } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import { SidebarProvider } from '@/components/organisms/Sidebar';
import { ShellSidebarOverrideProvider } from '@/contexts/ShellSidebarOverrideContext';
import { AppFlagProvider } from '@/lib/flags/client';
import { APP_FLAG_DEFAULTS } from '@/lib/flags/contracts';
import { UnifiedSidebar } from './UnifiedSidebar';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

const dashboardData: DashboardData = {
  user: { id: 'story-user' },
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
};

const meta: Meta<typeof UnifiedSidebar> = {
  title: 'Organisms/UnifiedSidebar',
  component: UnifiedSidebar,
  parameters: {
    layout: 'fullscreen',
  },
  decorators: [
    Story => (
      <QueryClientProvider client={queryClient}>
        <AppFlagProvider initialFlags={APP_FLAG_DEFAULTS}>
          <DashboardDataProvider value={dashboardData}>
            <TooltipProvider>
              <SidebarProvider>
                <ShellSidebarOverrideProvider>
                  <div className='h-screen w-(--app-shell-sidebar-width)'>
                    <Story />
                  </div>
                </ShellSidebarOverrideProvider>
              </SidebarProvider>
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

export const Operator: Story = {
  args: {
    section: 'ov',
    variant: 'ov',
  },
};
