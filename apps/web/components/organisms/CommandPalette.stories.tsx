import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect } from 'react';
import type { DashboardData } from '@/app/app/(shell)/dashboard/actions/dashboard-data';
import {
  DashboardDataContext,
  type DashboardDataContextValue,
} from '@/app/app/(shell)/dashboard/DashboardDataContext';
import {
  HeaderActionsProvider,
  useHeaderActions,
} from '@/contexts/HeaderActionsContext';
import { queryKeys } from '@/lib/queries/keys';
import { CommandPalette, CommandPaletteMainSurface } from './CommandPalette';

const STORY_PROFILE_ID = 'command-palette-story-profile';

type StoryConversation = {
  readonly id: string;
  readonly title: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly latestTurnStatus: 'completed';
};

function storyConversation(id: string, title: string): StoryConversation {
  return {
    id,
    title,
    createdAt: '2026-08-18T00:00:00.000Z',
    updatedAt: '2026-08-18T00:00:00.000Z',
    latestTurnStatus: 'completed',
  };
}

/**
 * One query client per story. `conversations: undefined` leaves the recent
 * chats query unseeded so it fetches through the story's API mock.
 */
function createStoryQueryClient(
  conversations: readonly StoryConversation[] | undefined
) {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: Number.POSITIVE_INFINITY,
      },
    },
  });
  client.setQueryData(queryKeys.releases.matrix(STORY_PROFILE_ID), []);
  if (conversations)
    client.setQueryData(queryKeys.chat.conversations(), conversations);
  client.setQueryData(queryKeys.chat.capabilities(STORY_PROFILE_ID), {
    tools: {
      albumArt: {
        availability: 'available',
        reason: null,
        reasonCode: null,
      },
    },
  });
  return client;
}

const storyQueryClient = createStoryQueryClient([
  storyConversation('story-thread', 'Plan the next release'),
]);

const storyDashboardData: DashboardData = {
  user: { id: 'story-user' },
  creatorProfiles: [],
  selectedProfile: {
    id: STORY_PROFILE_ID,
  } as DashboardData['selectedProfile'],
  needsOnboarding: false,
  sidebarCollapsed: false,
  hasSocialLinks: true,
  hasMusicLinks: true,
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
    percentage: 100,
    completedCount: 1,
    totalCount: 1,
    steps: [],
    profileIsLive: true,
  },
};

const storyDashboardDataContext: DashboardDataContextValue = {
  ...storyDashboardData,
  identities: storyDashboardData.creatorProfiles,
  activeIdentity: storyDashboardData.selectedProfile,
};

function OpenPaletteOnMount() {
  const { openCommandPalette } = useHeaderActions();
  useEffect(() => {
    openCommandPalette();
  }, [openCommandPalette]);
  return null;
}

function PaletteHeaderSlot() {
  const { commandPaletteHeader } = useHeaderActions();
  return (
    <header className='flex h-12 shrink-0 items-center border-b border-(--app-shell-frame-seam) px-3.5'>
      {commandPaletteHeader}
    </header>
  );
}

type ApiMockWindow = Window & {
  __jovieApiMock?: (request: {
    url: URL;
    init?: RequestInit;
  }) => Response | Promise<Response> | undefined;
};

/** Answers the recent-chats request the way a story asks; returns a restore. */
function stubConversations(respond: () => Promise<Response>) {
  const apiMockWindow = window as ApiMockWindow;
  const previous = apiMockWindow.__jovieApiMock;
  apiMockWindow.__jovieApiMock = request =>
    request.url.pathname === '/api/chat/conversations'
      ? respond()
      : previous?.(request);
  return () => {
    apiMockWindow.__jovieApiMock = previous;
  };
}

function CommandPaletteStorySurface({
  client = storyQueryClient,
  isAdmin = false,
}: {
  readonly client?: QueryClient;
  readonly isAdmin?: boolean;
}) {
  return (
    <QueryClientProvider client={client}>
      <DashboardDataContext.Provider
        value={{ ...storyDashboardDataContext, isAdmin }}
      >
        <HeaderActionsProvider>
          <div className='flex h-[44rem] w-[min(64rem,100vw)] flex-col overflow-hidden bg-(--app-shell-content-surface)'>
            <PaletteHeaderSlot />
            <CommandPaletteMainSurface />
          </div>
          <CommandPalette />
          <OpenPaletteOnMount />
        </HeaderActionsProvider>
      </DashboardDataContext.Provider>
    </QueryClientProvider>
  );
}

const meta = {
  title: 'Organisms/CommandPalette',
  component: CommandPalette,
  parameters: {
    layout: 'fullscreen',
    jovie: {
      // These belong to the private CommandPaletteInner adapter. The story
      // exercises them through the public controller + main-surface pairing.
      uncoveredProps: ['profileId', 'open', 'onOpenChange', 'presentation'],
    },
  },
  render: () => <CommandPaletteStorySurface />,
} satisfies Meta<typeof CommandPalette>;

export default meta;
type Story = StoryObj<typeof meta>;

export const BoundedDefaults: Story = {};

const loadingClient = createStoryQueryClient(undefined);
const emptyClient = createStoryQueryClient([]);
const longContentClient = createStoryQueryClient(
  Array.from({ length: 8 }, (_, index) =>
    storyConversation(
      `story-thread-${index}`,
      `Release planning for The Extraordinarily Long Album Title, part ${index + 1} (Deluxe Anniversary Remastered Edition)`
    )
  )
);
const offlineClient = createStoryQueryClient(undefined);
const rtlClient = createStoryQueryClient([
  storyConversation('story-thread-rtl', 'خطة الإصدار القادم'),
]);

/** Recent chats still loading: the registry rows render without them. */
export const LoadingRecentChats: Story = {
  beforeEach: () => stubConversations(() => new Promise<Response>(() => {})),
  render: () => <CommandPaletteStorySurface client={loadingClient} />,
};

/** No chats yet: the Recent Chats section is left out. */
export const EmptyRecentChats: Story = {
  render: () => <CommandPaletteStorySurface client={emptyClient} />,
};

export const LongContentRecentChats: Story = {
  render: () => <CommandPaletteStorySurface client={longContentClient} />,
};

/** Offline: the recent chats request fails and the palette keeps working. */
export const OfflineRecentChats: Story = {
  beforeEach: () =>
    stubConversations(() => Promise.reject(new TypeError('Failed to fetch'))),
  render: () => <CommandPaletteStorySurface client={offlineClient} />,
};

/** Non-admins never see the admin-only workspace switch row. */
export const RestrictedWithoutWorkspaceSwitch: Story = {
  render: () => <CommandPaletteStorySurface isAdmin={false} />,
};

export const RtlRecentChats: Story = {
  render: () => (
    <div dir='rtl' lang='ar'>
      <CommandPaletteStorySurface client={rtlClient} />
    </div>
  ),
};
