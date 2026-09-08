import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import type { WhatShippedResponse } from '@/lib/hud/what-shipped';
import { WhatShipped } from './WhatShipped';

const shipped: WhatShippedResponse = {
  generatedAt: '2026-09-05T14:50:00.000Z',
  available: true,
  observation: 'fresh',
  items: [
    {
      number: 17279,
      title: 'Keep Symphony workers alive through routing preflight',
      merged_at: '2026-09-05T14:45:00.000Z',
      url: 'https://github.com/JovieInc/Jovie/pull/17279',
    },
    {
      number: 17277,
      title: 'Observe closure health without pausing remediation',
      merged_at: '2026-09-05T14:35:00.000Z',
      url: 'https://github.com/JovieInc/Jovie/pull/17277',
    },
  ],
};

function createStoryQueryClient() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  client.setQueryData(['ops', 'what-shipped', null], shipped);
  return client;
}

function StoryShell({ children }: { readonly children: ReactElement }) {
  return (
    <QueryClientProvider client={createStoryQueryClient()}>
      <div className='w-[34rem] bg-base p-4 text-primary-token'>{children}</div>
    </QueryClientProvider>
  );
}

const meta = {
  title: 'Features/Admin/WhatShipped',
  component: WhatShipped,
  parameters: {
    layout: 'centered',
    jovie: {
      // These belong to private row/loading helpers, not WhatShipped's public
      // prop surface. The seeded query cache renders the populated state.
      uncoveredProps: ['mergedAt', 'isLoading'],
    },
  },
  decorators: [
    Story => (
      <StoryShell>
        <Story />
      </StoryShell>
    ),
  ],
} satisfies Meta<typeof WhatShipped>;

export default meta;
type Story = StoryObj<typeof meta>;

export const RecentMerges: Story = {};
