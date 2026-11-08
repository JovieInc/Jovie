import '../../styles/system-b-app.css';
import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, userEvent, within } from 'storybook/test';
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

function withHistory(history: ChatConversation[]): Decorator {
  return function WithHistory(Story) {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });
    client.setQueryData(queryKeys.chat.conversations(), history);
    return (
      <QueryClientProvider client={client}>
        <div className='min-h-120 bg-base p-4'>
          <Story />
        </div>
      </QueryClientProvider>
    );
  };
}

const meta = {
  title: 'Chat/ChatHistorySwitcher',
  component: ChatHistorySwitcher,
  args: { title: 'Tour Budget For The Fall Run', activeConversationId: 'tour' },
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
    await userEvent.click(
      within(canvasElement).getByTestId('chat-history-trigger')
    );
    const menu = await within(document.body).findByRole('menu');
    await expect(
      within(menu).getByPlaceholderText('Chat History')
    ).toBeInTheDocument();
  },
};

export const NoMatches: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByTestId('chat-history-trigger')
    );
    const menu = await within(document.body).findByRole('menu');
    await userEvent.type(
      within(menu).getByPlaceholderText('Chat History'),
      'zzz'
    );
    await expect(menu).toHaveTextContent('No Matching Chats');
  },
};

export const NoHistory: Story = {
  args: { title: null, activeConversationId: null },
  decorators: [withHistory([])],
  play: async ({ canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByTestId('chat-history-trigger')
    );
    const menu = await within(document.body).findByRole('menu');
    await expect(menu).toHaveTextContent('No Chats Yet');
  },
};
