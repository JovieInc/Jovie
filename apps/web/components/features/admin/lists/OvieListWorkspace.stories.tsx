import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { ListMember } from '@/lib/ovie/lists/model';
import type { ListDetail } from '@/lib/ovie/lists/types';
import { queryKeys } from '@/lib/queries/keys';
import { OvieListWorkspace } from './OvieListWorkspace';

const AT = '2026-10-04T03:00:00.000Z';
const member = (creatorId: string, extra: Partial<ListMember> = {}) =>
  ({
    creatorId,
    state: 'member',
    rating: null,
    favorite: false,
    source: 'manual',
    addedAt: AT,
    ...extra,
  }) as ListMember;

function withDetail(members: ListMember[]) {
  const detail: ListDetail = {
    list: {
      id: 'collab',
      name: 'Collab list',
      pinned: true,
      createdAt: AT,
      updatedAt: AT,
      members,
      labels: [],
    },
    creators: [
      {
        id: 'a',
        username: 'ava',
        displayName: 'Ava',
        avatarUrl: null,
        genres: ['indie pop'],
        spotifyFollowers: 25_000,
        location: 'Los Angeles, CA',
      },
      { id: 'b', username: 'bo', displayName: 'Bo', avatarUrl: null },
      { id: 'c', username: 'cy', displayName: 'Cy', avatarUrl: null },
    ],
    precision: { accepted: 0, rejected: 0, pending: 0, precision: null },
  };
  return function DetailDecorator(Story: () => ReactNode) {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });
    client.setQueryData(queryKeys.admin.lists.detail('collab'), detail);
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
  title: 'Features/Admin/Lists/OvieListWorkspace',
  component: OvieListWorkspace,
  parameters: { layout: 'fullscreen' },
  args: { listId: 'collab' },
} satisfies Meta<typeof OvieListWorkspace>;

export default meta;
type Story = StoryObj<typeof meta>;

export const MembersAndSuggestions: Story = {
  decorators: [
    withDetail([
      member('a', { rating: 4, favorite: true }),
      member('b', { rating: 2 }),
      member('c', {
        state: 'suggested',
        source: 'suggestion',
        suggestionReasons: ['Shares indie pop with 2 of 2 picks'],
      }),
    ]),
  ],
};

export const Empty: Story = { decorators: [withDetail([])] };
