import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { SidebarListsPayload } from '@/lib/ovie/lists/types';
import { queryKeys } from '@/lib/queries/keys';
import { OvieListsIndex } from './OvieListsIndex';

function withLists(payload: SidebarListsPayload | null) {
  return function ListsDecorator(Story: () => ReactNode) {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });
    if (payload) client.setQueryData(queryKeys.admin.lists.sidebar(), payload);
    return (
      <QueryClientProvider client={client}>
        <div className='ov-mode h-screen bg-base'>
          <Story />
        </div>
      </QueryClientProvider>
    );
  };
}

const meta = {
  title: 'Features/Admin/OvieListsIndex',
  component: OvieListsIndex,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof OvieListsIndex>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ListsAndSmartViews: Story = {
  decorators: [
    withLists({
      lists: [
        { id: 'collab', name: 'Collab list', count: 12, pendingSuggestions: 3 },
        { id: 'press', name: 'Press', count: 5, pendingSuggestions: 0 },
      ],
      smartViews: [
        { id: 'favorites', name: 'Favorites', count: 4 },
        { id: 'unrated', name: 'Unrated', count: 9 },
      ],
    }),
  ],
};

export const Empty: Story = {
  decorators: [withLists({ lists: [], smartViews: [] })],
};
