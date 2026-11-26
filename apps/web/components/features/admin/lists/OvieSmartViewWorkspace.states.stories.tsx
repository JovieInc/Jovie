import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { SmartViewDetail } from '@/lib/ovie/lists/types';
import { queryKeys } from '@/lib/queries/keys';
import { OvieSmartViewWorkspace } from './OvieSmartViewWorkspace';

function withClient(seed: (client: QueryClient) => void, dir?: 'rtl') {
  return function ViewDecorator(Story: () => ReactNode) {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });
    seed(client);
    return (
      <QueryClientProvider client={client}>
        <div dir={dir} className='ov-mode h-screen bg-base'>
          <Story />
        </div>
      </QueryClientProvider>
    );
  };
}

const longDetail: SmartViewDetail = {
  view: {
    id: 'favorites',
    name: 'Favorites that keep a very long saved view name for truncation',
  },
  rows: [
    {
      listId: 'press',
      listName: 'A press list with an unusually long name',
      member: {
        creatorId: 'a',
        state: 'member',
        rating: 4,
        favorite: true,
        source: 'manual',
        addedAt: '2026-10-04T03:00:00.000Z',
      },
    },
  ],
  creators: [
    {
      id: 'a',
      username: 'a-creator-with-a-very-long-handle',
      displayName: 'A creator with an extremely long display name',
      avatarUrl: null,
    },
  ],
};

const meta = {
  title: 'Features/Admin/Lists/OvieSmartViewWorkspace/States',
  component: OvieSmartViewWorkspace,
  parameters: { layout: 'fullscreen' },
  args: { viewId: 'favorites' },
} satisfies Meta<typeof OvieSmartViewWorkspace>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Loading: the view query has not resolved. */
export const LoadingView: Story = {
  decorators: [withClient(() => {})],
};

/** Error: the view request failed and nothing is cached. */
export const ErrorViewUnavailable: Story = {
  decorators: [
    withClient(client => {
      client
        .getQueryCache()
        .build(client, { queryKey: queryKeys.admin.lists.view('favorites') })
        .setState({
          status: 'error',
          error: new Error('View could not load'),
          fetchStatus: 'idle',
        });
    }),
  ],
};

/** Long content: long view, list and creator names. */
export const LongContentNames: Story = {
  decorators: [
    withClient(client =>
      client.setQueryData(queryKeys.admin.lists.view('favorites'), longDetail)
    ),
  ],
};

/** Rtl: the view in a right-to-left document. */
export const RtlView: Story = {
  decorators: [
    withClient(
      client =>
        client.setQueryData(
          queryKeys.admin.lists.view('favorites'),
          longDetail
        ),
      'rtl'
    ),
  ],
};
