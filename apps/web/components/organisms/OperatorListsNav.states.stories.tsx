import { TooltipProvider } from '@jovie/ui';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
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
  title: 'Organisms/OperatorListsNav/States',
  component: OperatorListsNav,
  parameters: { layout: 'fullscreen' },
  args: { pathname: '/app/ov/lists/collab' },
} satisfies Meta<typeof OperatorListsNav>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Loading: the sidebar query has no data yet, so only New List shows. */
export const LoadingNoData: Story = {
  decorators: [withLists(null)],
};

/** Long content: list names far longer than the rail, which truncate. */
export const LongContentNames: Story = {
  decorators: [
    withLists({
      lists: [
        {
          id: 'long',
          name: 'A very long list name for the collaborators we met at the festival last summer',
          count: 128,
          pendingSuggestions: 3,
        },
      ],
      smartViews: [
        {
          id: 'suggested',
          name: 'Suggested creators awaiting a first review from the team',
          count: 99,
        },
      ],
    }),
  ],
};
