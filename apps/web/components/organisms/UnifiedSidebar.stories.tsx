import {
  RenderedFamily,
  RenderedSidebarFamily,
} from '@/.storybook/rendered-family';
import '../../styles/system-b-app.css';
import { TooltipProvider } from '@jovie/ui';
import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { withSignedInSession } from '@/.storybook/signed-in-session';
import type { DashboardData } from '@/app/app/(shell)/dashboard/actions/dashboard-data';
import { DashboardDataProvider } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import { ChatsPageClient } from '@/app/app/(shell)/threads/ThreadsPageClient';
import { DashboardHeader } from '@/components/features/dashboard/organisms/DashboardHeader';
import { SidebarCollapseButton } from '@/components/molecules/sidebar-collapse-button';
import { AppShellFrame } from '@/components/organisms/AppShellFrame';
import { SidebarProvider, useSidebar } from '@/components/organisms/sidebar';
import { APP_ROUTES } from '@/constants/routes';
import { HeaderActionsProvider } from '@/contexts/HeaderActionsContext';
import { ShellSidebarOverrideProvider } from '@/contexts/ShellSidebarOverrideContext';
import { JovieAuthValuesProvider } from '@/hooks/useJovieAuth';
import { AppFlagProvider } from '@/lib/flags/client';
import { APP_FLAG_DEFAULTS } from '@/lib/flags/contracts';
import { queryKeys } from '@/lib/queries/keys';
import { UnifiedSidebar } from './UnifiedSidebar';

function SidebarStoryFrame({
  children,
  composed,
}: {
  readonly children: React.ReactNode;
  readonly composed: boolean;
}) {
  return composed ? (
    <RenderedFamily
      name='unified-sidebar-shell'
      owner='UnifiedSidebar'
      interactive
    >
      <div className='h-screen w-full'>{children}</div>
    </RenderedFamily>
  ) : (
    <RenderedSidebarFamily name='unified-sidebar' owner='UnifiedSidebar'>
      <div className='h-screen w-(--app-shell-sidebar-width)'>{children}</div>
    </RenderedSidebarFamily>
  );
}

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

queryClient.setQueryData(queryKeys.admin.lists.sidebar(), {
  lists: [
    { id: 'collab', name: 'Collab list', count: 12, pendingSuggestions: 0 },
    { id: 'press', name: 'Press', count: 0, pendingSuggestions: 0 },
  ],
  smartViews: [{ id: 'favorites', name: 'Favorites', count: 4 }],
});

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
    (Story, context) => (
      <QueryClientProvider client={queryClient}>
        <AppFlagProvider initialFlags={APP_FLAG_DEFAULTS}>
          <DashboardDataProvider value={dashboardData}>
            <TooltipProvider>
              <StorySidebarProvider>
                <JovieAuthValuesProvider>
                  <HeaderActionsProvider>
                    <ShellSidebarOverrideProvider>
                      <SidebarStoryFrame
                        composed={Boolean(context.parameters.composedShell)}
                      >
                        <Story />
                      </SidebarStoryFrame>
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

const emptyHistoryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});
emptyHistoryClient.setQueryData(queryKeys.chat.conversations(), []);

export const EmptyHistory: Story = {
  decorators: [
    Story => (
      <QueryClientProvider client={emptyHistoryClient}>
        <Story />
      </QueryClientProvider>
    ),
  ],
};

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

function ComposedHistoryShell(
  args: React.ComponentProps<typeof UnifiedSidebar>
) {
  return (
    <AppShellFrame
      sidebar={<UnifiedSidebar {...args} />}
      header={<DashboardHeader breadcrumbs={[{ label: 'Work' }]} />}
      main={
        <label className='block p-4 text-sm text-primary-token'>
          Campaign Draft
          <textarea
            aria-label='Campaign Draft'
            className='mt-2 block w-full rounded-md border border-subtle bg-surface-1 p-3'
            defaultValue='Announce the autumn release'
          />
        </label>
      }
    />
  );
}

export const ComposedHistory: Story = {
  parameters: {
    composedShell: true,
    nextjs: { navigation: { pathname: APP_ROUTES.LIBRARY } },
  },
  render: args => <ComposedHistoryShell {...args} />,
};

export const ComposedEmptyHistory: Story = {
  ...EmptyHistory,
  ...ComposedHistory,
  decorators: EmptyHistory.decorators,
};

const chatsClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});
chatsClient.setQueryData(queryKeys.chat.conversations(), [
  {
    id: 'readable',
    title: 'All This Noise EP',
    createdAt: '2026-10-13T12:00:00Z',
    updatedAt: '2026-10-13T12:00:00Z',
    latestTurnStatus: 'completed',
  },
  {
    id: 'clipped',
    title:
      'Plan the autumn release campaign with audience insights, touring updates, distribution timelines, press coverage, artwork approvals and every important milestone for the full team',
    createdAt: '2026-10-12T12:00:00Z',
    updatedAt: '2026-10-12T12:00:00Z',
    latestTurnStatus: 'completed',
  },
]);

export const ComposedChats: Story = {
  parameters: {
    composedShell: true,
    nextjs: { navigation: { pathname: APP_ROUTES.CHATS } },
  },
  decorators: [
    Story => (
      <QueryClientProvider client={chatsClient}>
        <Story />
      </QueryClientProvider>
    ),
  ],
  render: args => (
    <AppShellFrame
      sidebar={<UnifiedSidebar {...args} />}
      header={<DashboardHeader breadcrumbs={[{ label: 'Chats' }]} />}
      main={<ChatsPageClient />}
    />
  ),
};
