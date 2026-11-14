import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { expect, within } from 'storybook/test';
import type { SidebarListsPayload } from '@/lib/ovie/lists/types';
import { queryKeys } from '@/lib/queries/keys';
import { OvieListsIndex } from './OvieListsIndex';

/**
 * State coverage for the lists index. A seeded query cache drives the data
 * states; with no seed the Storybook API stub answers 503, which is the
 * component's real failure path.
 */
function withLists(payload: SidebarListsPayload | null, dir?: 'rtl') {
  return function ListsStateDecorator(Story: () => ReactNode) {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });
    if (payload) client.setQueryData(queryKeys.admin.lists.sidebar(), payload);
    return (
      <QueryClientProvider client={client}>
        <div className='ov-mode h-screen bg-base' dir={dir}>
          <Story />
        </div>
      </QueryClientProvider>
    );
  };
}

const meta = {
  title: 'Features/Admin/OvieListsIndex States',
  component: OvieListsIndex,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof OvieListsIndex>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Error: the lists request fails and the page offers a retry. */
export const ErrorListsUnavailable: Story = {
  decorators: [withLists(null)],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByText('Lists unavailable', undefined, {
        timeout: 4_000,
      })
    ).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Retry' })).toBeVisible();
  },
};

const LONG_LIST_NAME =
  'Collaborators for the spring remix package, second round, with every vocalist who replied after the label showcase';

/** Long content: long names truncate on one line and counts stay visible. */
export const LongContentNames: Story = {
  decorators: [
    withLists({
      lists: [
        {
          id: 'long',
          name: LONG_LIST_NAME,
          count: 1280,
          pendingSuggestions: 245,
        },
        { id: 'press', name: 'Press', count: 5, pendingSuggestions: 0 },
      ],
      smartViews: [
        {
          id: 'favorites',
          name: 'Favorites rated four stars or higher across every list this quarter',
          count: 412,
        },
      ],
    }),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(LONG_LIST_NAME)).toBeVisible();
    await expect(canvas.getByText('1280 · 245 suggested')).toBeVisible();
  },
};

/** Right-to-left: rows mirror, with the count on the left edge. */
export const RtlLists: Story = {
  decorators: [
    withLists(
      {
        lists: [
          {
            id: 'collab',
            name: 'قائمة التعاون',
            count: 12,
            pendingSuggestions: 3,
          },
          { id: 'press', name: 'الصحافة', count: 5, pendingSuggestions: 0 },
        ],
        smartViews: [{ id: 'favorites', name: 'المفضلة', count: 4 }],
      },
      'rtl'
    ),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getAllByRole('link')).toHaveLength(3);
  },
};
