import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { SidebarListsPayload } from '@/lib/ovie/lists/types';
import { queryKeys } from '@/lib/queries/keys';
import { OvieListsIndex } from './OvieListsIndex';

function withLists(payload: SidebarListsPayload | null, dir?: 'rtl') {
  return function ListsDecorator(Story: () => ReactNode) {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });
    if (payload) client.setQueryData(queryKeys.admin.lists.sidebar(), payload);
    return (
      <QueryClientProvider client={client}>
        <div dir={dir} className='ov-mode h-screen bg-base'>
          <Story />
        </div>
      </QueryClientProvider>
    );
  };
}

const meta = {
  title: 'Features/Admin/OvieListsIndex/States',
  component: OvieListsIndex,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof OvieListsIndex>;

export default meta;
type Story = StoryObj<typeof meta>;

const longPayload: SidebarListsPayload = {
  lists: [
    {
      id: 'long',
      name: 'A collaboration list with an extremely long name that must truncate inside its row',
      count: 1204,
      pendingSuggestions: 37,
    },
  ],
  smartViews: [],
};

/** Error: the lists request failed and nothing is cached. */
export const ErrorListsUnavailable: Story = {
  decorators: [
    function ErrorDecorator(Story) {
      const client = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      });
      client
        .getQueryCache()
        .build(client, {
          queryKey: queryKeys.admin.lists.sidebar(),
        })
        .setState({
          status: 'error',
          error: new Error('Lists could not load'),
          fetchStatus: 'idle',
        });
      return (
        <QueryClientProvider client={client}>
          <div className='ov-mode h-screen bg-base'>
            <Story />
          </div>
        </QueryClientProvider>
      );
    },
  ],
};

/** Long content: a long list name and large counts. */
export const LongContentListName: Story = {
  decorators: [withLists(longPayload)],
};

/** Rtl: the index in a right-to-left document. */
export const RtlIndex: Story = {
  decorators: [withLists(longPayload, 'rtl')],
};
