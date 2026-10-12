import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { SmartViewDetail } from '@/lib/ovie/lists/types';
import { queryKeys } from '@/lib/queries/keys';
import { OvieSmartViewWorkspace } from './OvieSmartViewWorkspace';

function withView(detail: SmartViewDetail) {
  return function ViewDecorator(Story: () => ReactNode) {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });
    client.setQueryData(queryKeys.admin.lists.view(detail.view.id), detail);
    return (
      <QueryClientProvider client={client}>
        <div className='ov-mode h-screen bg-base'>
          <Story />
        </div>
      </QueryClientProvider>
    );
  };
}

const VIEW = { id: 'favorites', name: 'Favorites' };

const meta = {
  title: 'Features/Admin/Lists/OvieSmartViewWorkspace',
  component: OvieSmartViewWorkspace,
  parameters: { layout: 'fullscreen' },
  args: { viewId: 'favorites' },
} satisfies Meta<typeof OvieSmartViewWorkspace>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AcrossLists: Story = {
  decorators: [
    withView({
      view: VIEW,
      rows: [
        {
          listId: 'press',
          listName: 'Press',
          member: {
            creatorId: 'a',
            state: 'member',
            rating: 5,
            favorite: true,
            source: 'manual',
            addedAt: '2026-10-04T03:00:00.000Z',
          },
        },
      ],
      creators: [
        { id: 'a', username: 'ava', displayName: 'Ava', avatarUrl: null },
      ],
    }),
  ],
};

export const Empty: Story = {
  decorators: [withView({ view: VIEW, rows: [], creators: [] })],
};
