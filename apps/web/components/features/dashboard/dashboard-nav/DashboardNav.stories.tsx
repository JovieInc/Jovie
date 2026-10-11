import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { RenderedSidebarFamily } from '@/.storybook/rendered-family';
import type { DashboardData } from '@/app/app/(shell)/dashboard/actions/dashboard-data';
import { DashboardDataProvider } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import { InboxRuntimeNotification } from '@/components/features/opportunity-inbox/InboxRuntimeNotification';
import {
  Sidebar,
  SidebarContent,
  SidebarProvider,
} from '@/components/organisms/sidebar';
import { RuntimeUpdateProvider } from '@/components/shell/RuntimeUpdateProvider';
import { AppFlagProvider } from '@/lib/flags/client';
import { APP_FLAG_DEFAULTS } from '@/lib/flags/contracts';
import { DashboardNav } from './DashboardNav';

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

const dashboardData: DashboardData = {
  user: { id: 'user-123' },
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
    totalCount: 6,
    steps: [],
    profileIsLive: false,
  },
};

const meta = {
  title: 'Dashboard/Navigation/Customer Rail',
  component: DashboardNav,
  parameters: {
    layout: 'fullscreen',
    jovie: { uncoveredProps: ['isLoading'] },
  },
  decorators: [
    Story => (
      <QueryClientProvider client={queryClient}>
        <AppFlagProvider initialFlags={APP_FLAG_DEFAULTS}>
          <DashboardDataProvider value={dashboardData}>
            <StorySidebarProvider>
              <RenderedSidebarFamily name='dashboard-nav' owner='DashboardNav'>
                <div className='flex h-screen min-h-[42rem] bg-base'>
                  <Sidebar>
                    <SidebarContent>
                      <Story />
                    </SidebarContent>
                  </Sidebar>
                </div>
              </RenderedSidebarFamily>
            </StorySidebarProvider>
          </DashboardDataProvider>
        </AppFlagProvider>
      </QueryClientProvider>
    ),
  ],
} satisfies Meta<typeof DashboardNav>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const RuntimeUpdate: Story = {
  render: () => (
    <RuntimeUpdateProvider>
      <DashboardNav />
      <InboxRuntimeNotification />
    </RuntimeUpdateProvider>
  ),
};
