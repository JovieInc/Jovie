import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode, useLayoutEffect, useState } from 'react';
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
import { queryKeys } from '@/lib/queries/keys';
import type { ChatConversation } from '@/lib/queries/useChatConversationsQuery';
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

type ApiMockWindow = Window & {
  __jovieApiMock?: (request: {
    url: URL;
    init?: RequestInit;
  }) => Response | Promise<Response> | undefined;
};

type ConversationsReply = 'pending' | 'unavailable' | 'offline';

/**
 * Gives a story its own query cache for the rail's recent chats. A seeded
 * list renders as cached history; otherwise the conversations endpoint
 * answers with the given reply through the preview's per-story API mock.
 */
function ConversationsFixture({
  seed,
  reply = 'unavailable',
  children,
}: Readonly<{
  seed?: readonly ChatConversation[];
  reply?: ConversationsReply;
  children: ReactNode;
}>) {
  const [client] = useState(() => {
    const next = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });
    if (seed) next.setQueryData(queryKeys.chat.conversations(), [...seed]);
    return next;
  });

  useLayoutEffect(() => {
    const apiMockWindow = window as ApiMockWindow;
    const previous = apiMockWindow.__jovieApiMock;
    apiMockWindow.__jovieApiMock = ({ url }) => {
      if (url.pathname !== '/api/chat/conversations') return undefined;
      if (reply === 'pending') return new Promise<Response>(() => undefined);
      if (reply === 'offline')
        return Promise.reject(new TypeError('Failed to fetch'));
      return Response.json({ error: 'Unavailable' }, { status: 503 });
    };
    return () => {
      apiMockWindow.__jovieApiMock = previous;
    };
  }, [reply]);

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function conversation(
  id: string,
  title: string,
  minutesAgo: number
): ChatConversation {
  const at = new Date(Date.now() - minutesAgo * 60_000).toISOString();
  return {
    id,
    title,
    createdAt: at,
    updatedAt: at,
    latestTurnStatus: 'completed',
  };
}

/** Recent chats are still loading: the history block shows one skeleton row. */
export const LoadingThreads: Story = {
  decorators: [
    Story => (
      <ConversationsFixture reply='pending'>
        <Story />
      </ConversationsFixture>
    ),
  ],
};

/** No chat history yet: the rail shows navigation only, no history block. */
export const EmptyThreads: Story = {
  decorators: [
    Story => (
      <ConversationsFixture seed={[]}>
        <Story />
      </ConversationsFixture>
    ),
  ],
};

/** The conversations endpoint failed: history says so and offers a retry. */
export const ErrorThreadsUnavailable: Story = {
  decorators: [
    Story => (
      <ConversationsFixture reply='unavailable'>
        <Story />
      </ConversationsFixture>
    ),
  ],
};

/** The network is down: the history fetch fails and keeps its retry. */
export const OfflineThreads: Story = {
  decorators: [
    Story => (
      <ConversationsFixture reply='offline'>
        <Story />
      </ConversationsFixture>
    ),
  ],
};

/** Long chat titles truncate inside the rail without widening it. */
export const LongContentThreadTitles: Story = {
  decorators: [
    Story => (
      <ConversationsFixture
        seed={[
          conversation(
            'long-1',
            'Plan the full European summer festival run including travel, merch restocks and every press interview request',
            4
          ),
          conversation(
            'long-2',
            'Draft the pre-save campaign copy for the deluxe edition with alternate versions for every streaming platform',
            40
          ),
          conversation(
            'long-3',
            'Reconcile the distributor royalty statement against the label split sheet for the last three quarters',
            200
          ),
          conversation('long-4', 'Fan segment Q3 planning', 600),
          conversation('long-5', 'Tour announce caption drafts', 900),
          conversation('long-6', 'Merch drop checklist', 1200),
        ]}
      >
        <Story />
      </ConversationsFixture>
    ),
  ],
};

export const RtlThreads: Story = {
  render: () => (
    <div dir='rtl' lang='ar' className='contents'>
      <DashboardNav />
    </div>
  ),
  decorators: [
    Story => (
      <ConversationsFixture
        seed={[
          conversation('rtl-1', 'خطة جولة المهرجانات الصيفية في أوروبا', 5),
          conversation('rtl-2', 'مسودة نص حملة الحفظ المسبق للألبوم', 50),
          conversation('rtl-3', 'مراجعة كشف حقوق الملكية من الموزع', 300),
        ]}
      >
        <Story />
      </ConversationsFixture>
    ),
  ],
};
