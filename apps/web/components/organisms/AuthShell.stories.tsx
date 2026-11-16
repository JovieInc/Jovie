import { TooltipProvider } from '@jovie/ui';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { DashboardData } from '@/app/app/(shell)/dashboard/actions/dashboard-data';
import { DashboardDataProvider } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import { PreviewPanelProvider } from '@/app/app/(shell)/dashboard/PreviewPanelContext';
import { SidebarProvider } from '@/components/organisms/sidebar';
import { HeaderActionsProvider } from '@/contexts/HeaderActionsContext';
import { ShellSidebarOverrideProvider } from '@/contexts/ShellSidebarOverrideContext';
import { AppFlagProvider } from '@/lib/flags/client';
import { APP_FLAG_DEFAULTS } from '@/lib/flags/contracts';
import { AuthShell } from './AuthShell';

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
    totalCount: 6,
    steps: [],
    profileIsLive: false,
  },
};

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
              <HeaderActionsProvider>
                <ShellSidebarOverrideProvider>
                  <PreviewPanelProvider enabled={false}>
                    <Story />
                  </PreviewPanelProvider>
                </ShellSidebarOverrideProvider>
              </HeaderActionsProvider>
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

/** Settings drops the top header: sidebar and content only. */
export const PartialWithoutHeader: Story = {
  args: {
    section: 'settings',
    children: (
      <div className='p-6'>
        <p className='text-sm text-secondary-token'>Settings content.</p>
      </div>
    ),
  },
};

export const LongContentBreadcrumbs: Story = {
  args: {
    breadcrumbs: [
      { label: 'Releases', href: '/app/releases' },
      {
        label:
          'The Extraordinarily Long Album Title That Keeps Going Well Past Any Reasonable Line Length (Deluxe Anniversary Remastered Edition)',
      },
    ],
    children: (
      <div className='space-y-3 p-6'>
        {Array.from({ length: 20 }, (_, index) => index + 1).map(track => (
          <p
            key={`track-${track}`}
            className='text-sm text-secondary-token break-words'
          >
            Track {track}: An Unusually Long Track Title That Wraps Inside The
            Content Panel
          </p>
        ))}
      </div>
    ),
  },
};

export const RtlShell: Story = {
  args: {
    breadcrumbs: [{ label: 'الإصدارات' }],
    children: (
      <div className='p-6'>
        <p className='text-sm text-secondary-token'>محتوى لوحة العميل.</p>
      </div>
    ),
  },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
};
