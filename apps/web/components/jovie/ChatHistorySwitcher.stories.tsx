import '../../styles/system-b-app.css';
import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, userEvent, within } from 'storybook/test';
import { THREAD_READ_STORAGE_KEY } from '@/components/shell/SidebarThreadsSection';
import { queryKeys } from '@/lib/queries/keys';
import type { ChatConversation } from '@/lib/queries/useChatConversationsQuery';
import { ChatHistorySwitcher } from './ChatHistorySwitcher';

const HOUR = 3_600_000;

function chat(id: string, title: string, hoursAgo: number): ChatConversation {
  const updatedAt = new Date(Date.now() - hoursAgo * HOUR).toISOString();
  return {
    id,
    title,
    createdAt: updatedAt,
    updatedAt,
    latestMessageRole: 'assistant',
    latestTurnStatus: 'completed',
  };
}

const HISTORY: ChatConversation[] = [
  chat('release', 'Spring Release Plan', 0.1),
  chat('tour', 'Tour Budget For The Fall Run', 5),
  chat('merch', 'Merch Drop Ideas', 30),
  chat('press', 'Press Kit Rewrite', 80),
  chat('setlist', 'Setlist For The Brooklyn Show', 200),
  chat('sync', 'Sync Licensing Pitch', 400),
  chat('remix', 'Remix Contest Rules', 900),
  chat('label', 'Label Meeting Notes', 1500),
  chat('fans', 'Top Fans By City', 2500),
  chat('video', 'Music Video Treatment', 4000),
  chat('grant', 'Arts Grant Application', 6000),
  chat('budget', 'Studio Budget', 9000),
];

type SeedCache = (client: QueryClient) => void;

function withClient(seed: SeedCache): Decorator {
  return function WithClient(Story) {
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false, retryOnMount: false, staleTime: Infinity },
      },
    });
    seed(client);
    return (
      <QueryClientProvider client={client}>
        <div className='min-h-120 bg-base p-4'>
          <Story />
        </div>
      </QueryClientProvider>
    );
  };
}

function withHistory(history: ChatConversation[]): Decorator {
  return withClient(client =>
    client.setQueryData(queryKeys.chat.conversations(), history)
  );
}

async function openMenu(canvasElement: HTMLElement) {
  await userEvent.click(
    within(canvasElement).getByTestId('chat-history-trigger')
  );
  // A searchable menu presents its content as a group — a text input is not
  // an allowed child of role="menu" (axe aria-required-children) — with the
  // item rows in an inner menu. Scope to the group so the pinned search
  // field is inside the queried container.
  return within(document.body).findByRole('group');
}

const meta = {
  title: 'Chat/ChatHistorySwitcher',
  component: ChatHistorySwitcher,
  args: {
    title: 'Tour Budget For The Fall Run',
    activeConversationId: 'tour',
    // `modal: false`: a modal Radix menu `hideOthers`-ARIA-hides the story
    // canvas around the portaled content, which fails axe aria-hidden-focus
    // on the focusable trigger. Non-modal is visually identical for demos
    // (AudienceRowActionsMenu stories follow the same convention).
    modal: false,
  },
  decorators: [withHistory(HISTORY)],
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof ChatHistorySwitcher>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Closed: Story = {};

export const NewChat: Story = {
  args: { title: null, activeConversationId: null },
};

/** Open on a long list: pinned search, the current chat selected, bottom fade. */
export const Open: Story = {
  play: async ({ canvasElement }) => {
    const menu = await openMenu(canvasElement);
    await expect(
      within(menu).getByPlaceholderText('Chat History')
    ).toBeInTheDocument();
  },
};

/** New replies since this browser last read them get a dot; read rows don't. */
export const Unread: Story = {
  beforeEach: () => {
    const previous = globalThis.localStorage.getItem(THREAD_READ_STORAGE_KEY);
    const readLater = new Date(Date.now() + HOUR).toISOString();
    const readAt = Object.fromEntries(
      HISTORY.filter(row => !['release', 'merch'].includes(row.id)).map(row => [
        row.id,
        readLater,
      ])
    );
    globalThis.localStorage.setItem(
      THREAD_READ_STORAGE_KEY,
      JSON.stringify(readAt)
    );
    return () => {
      if (previous === null) {
        globalThis.localStorage.removeItem(THREAD_READ_STORAGE_KEY);
      } else {
        globalThis.localStorage.setItem(THREAD_READ_STORAGE_KEY, previous);
      }
    };
  },
  play: async ({ canvasElement }) => {
    await openMenu(canvasElement);
  },
};

export const NoMatches: Story = {
  play: async ({ canvasElement }) => {
    const menu = await openMenu(canvasElement);
    await userEvent.type(
      within(menu).getByPlaceholderText('Chat History'),
      'zzz'
    );
    await expect(menu).toHaveTextContent('No Matching Chats');
  },
};

export const EmptyHistory: Story = {
  args: { title: null, activeConversationId: null },
  decorators: [withHistory([])],
  play: async ({ canvasElement }) => {
    const menu = await openMenu(canvasElement);
    await expect(menu).toHaveTextContent('No Chats Yet');
  },
};

/** First open with nothing cached: the list request is still in flight. */
export const LoadingHistory: Story = {
  decorators: [withClient(() => undefined)],
  beforeEach: () => {
    const realFetch = globalThis.fetch;
    globalThis.fetch = () => new Promise<Response>(() => undefined);
    return () => {
      globalThis.fetch = realFetch;
    };
  },
  play: async ({ canvasElement }) => {
    await openMenu(canvasElement);
  },
};

/** The list failed to load (offline lands here too): message plus Retry. */
export const ErrorLoadingHistory: Story = {
  decorators: [
    withClient(client => {
      client
        .getQueryCache()
        .build(client, { queryKey: queryKeys.chat.conversations() })
        .setState({
          status: 'error',
          fetchStatus: 'idle',
          error: new Error('offline'),
          errorUpdatedAt: Date.now(),
        });
    }),
  ],
  play: async ({ canvasElement }) => {
    const menu = await openMenu(canvasElement);
    await expect(menu).toHaveTextContent("Couldn't Load Chats");
    await expect(
      within(menu).getByRole('menuitem', { name: 'Retry' })
    ).toBeInTheDocument();
  },
};

/** A long title truncates inside a narrow header; long rows truncate too. */
export const LongContent: Story = {
  args: {
    title:
      'Setlist, Merch And Travel Budget For The Brooklyn, Philly And Boston Run',
  },
  decorators: [
    withHistory([
      chat(
        'long',
        'Setlist, Merch And Travel Budget For The Brooklyn, Philly And Boston Run',
        0.2
      ),
      ...HISTORY,
    ]),
    Story => (
      <div className='w-64'>
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement }) => {
    await openMenu(canvasElement);
  },
};

export const RtlOverflow: Story = {
  args: {
    title: 'خطة إصدار الربيع وميزانية الجولة الطويلة جدا',
    activeConversationId: 'ar1',
  },
  decorators: [
    withHistory([
      chat('ar1', 'خطة إصدار الربيع وميزانية الجولة الطويلة جدا', 0.1),
      chat('ar2', 'أفكار إطلاق البضائع', 30),
      chat('ar3', 'قائمة الأغاني لعرض بروكلين', 200),
    ]),
    Story => (
      <div dir='rtl' lang='ar' className='w-64'>
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement }) => {
    await openMenu(canvasElement);
  },
};
