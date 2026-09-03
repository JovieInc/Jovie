import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { OvieShippingStateCard } from './OvieShippingStateCard';

/** Empty shipping-state projection shape used only to hydrate the story's
 * query cache so the card renders its reserved-geometry idle state without
 * network access. */
function createStoryQueryClient() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity },
      mutations: { retry: false },
    },
  });
  return client;
}

function StoryShell({ children }: { children: ReactElement }) {
  return (
    <QueryClientProvider client={createStoryQueryClient()}>
      <div className='w-80 bg-base p-4 text-primary-token'>
        {children}
      </div>
    </QueryClientProvider>
  );
}

const meta = {
  title: 'Features/Admin/Hud/OvieShippingStateCard',
  component: OvieShippingStateCard,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <StoryShell>
        <Story />
      </StoryShell>
    ),
  ],
} satisfies Meta<typeof OvieShippingStateCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
