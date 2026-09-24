import { TooltipProvider } from '@jovie/ui';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { DashboardData } from '@/app/app/(shell)/dashboard/actions/dashboard-data';
import { DashboardDataProvider } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import { PreviewPanelProvider } from '@/app/app/(shell)/dashboard/PreviewPanelContext';
import { SidebarProvider } from '@/components/organisms/Sidebar';
import { ShellSidebarOverrideProvider } from '@/contexts/ShellSidebarOverrideContext';
import { AppFlagProvider } from '@/lib/flags/client';
import { APP_FLAG_DEFAULTS } from '@/lib/flags/contracts';
import { AuthShell } from './AuthShell';

const dashboardData = {
  user: { id: 'story-user' },
  creatorProfiles: [],
  selectedProfile: null,
  needsOnboarding: false,
  sidebarCollapsed: false,
  hasSocialLinks: false,
  hasMusicLinks: false,
  isAdmin: false,
} as DashboardData;

const meta = {
  title: 'Organisms/AuthShell',
  component: AuthShell,
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    section: 'dashboard',
    breadcrumbs: [],
  },
  decorators: [
    Story => (
      <AppFlagProvider initialFlags={APP_FLAG_DEFAULTS}>
        <DashboardDataProvider value={dashboardData}>
          <TooltipProvider delayDuration={0} skipDelayDuration={0}>
            <SidebarProvider>
              <ShellSidebarOverrideProvider>
                <PreviewPanelProvider enabled={false}>
                  <Story />
                </PreviewPanelProvider>
              </ShellSidebarOverrideProvider>
            </SidebarProvider>
          </TooltipProvider>
        </DashboardDataProvider>
      </AppFlagProvider>
    ),
  ],
} satisfies Meta<typeof AuthShell>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Dashboard: Story = {
  args: {
    children: (
      <div className='p-6'>
        <p className='text-sm text-secondary-token'>
          Customer shell content panel.
        </p>
      </div>
    ),
  },
};

export const Operator: Story = {
  args: {
    section: 'ov',
    showMobileTabs: false,
    children: (
      <div className='p-6'>
        <p className='text-sm text-secondary-token'>Operator shell content.</p>
      </div>
    ),
  },
};
