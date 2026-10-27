import { TooltipProvider } from '@jovie/ui';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { expect, within } from 'storybook/test';
import { RenderedFamily } from '@/.storybook/rendered-family';
import { SidebarProvider } from '@/components/organisms/sidebar';
import type { SidebarListsPayload } from '@/lib/ovie/lists/types';
import { queryKeys } from '@/lib/queries/keys';
import { OperatorListsNav } from './OperatorListsNav';

function withLists(payload: SidebarListsPayload | null) {
  return function ListsDecorator(Story: () => ReactNode) {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });
    if (payload) client.setQueryData(queryKeys.admin.lists.sidebar(), payload);
    return (
      <QueryClientProvider client={client}>
        <TooltipProvider>
          <SidebarProvider>
            <div className='ov-mode w-full max-w-60 bg-base'>
              <RenderedFamily
                name='OperatorListsNav'
                owner='OperatorListsNav'
                interactive
              >
                <div className='p-2'>
                  <Story />
                </div>
              </RenderedFamily>
            </div>
          </SidebarProvider>
        </TooltipProvider>
      </QueryClientProvider>
    );
  };
}

const meta = {
  title: 'Organisms/OperatorListsNav',
  component: OperatorListsNav,
  parameters: { layout: 'fullscreen' },
  args: { pathname: '/app/ov/lists/collab' },
} satisfies Meta<typeof OperatorListsNav>;

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
        { id: 'suggested', name: 'Suggested', count: 3 },
        { id: 'favorites', name: 'Favorites', count: 4 },
        { id: 'unrated', name: 'Unrated', count: 9 },
      ],
    }),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const textStart = (label: string) => {
      const range = document.createRange();
      range.selectNodeContents(canvas.getByText(label));
      return range.getBoundingClientRect().left;
    };
    await expect(
      Math.abs(textStart('New List') - textStart('Collab list'))
    ).toBeLessThan(1);
  },
};

/** Empty smart views are omitted, so a fresh workspace shows only New list. */
export const Empty: Story = {
  decorators: [withLists({ lists: [], smartViews: [] })],
};
