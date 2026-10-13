import '@/styles/system-b-app.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { RightPanelProvider } from '@/contexts/RightPanelContext';
import type { OutboundQueue } from '@/lib/outbound/types';
import { queryKeys } from '@/lib/queries/keys';
import { OutboundWorkspace } from './OutboundWorkspace';
import { outboundFixtureQueue, outboundFixtureRow } from './outbound-fixtures';

const ADA = outboundFixtureRow();
const queue = outboundFixtureQueue([
  ADA,
  outboundFixtureRow({
    leadId: '00000000-0000-4000-8000-000000000002',
    name: 'Bea',
    handle: 'bea',
    fit: 'high',
    fitScore: 82,
    whyNow: 'Released a single 12 days ago',
    rank: 2,
    approval: { ...ADA.approval, targetRevision: 'b'.repeat(64) },
  }),
  outboundFixtureRow({
    leadId: '00000000-0000-4000-8000-000000000003',
    name: 'Cy',
    handle: 'cy',
    view: 'sent',
    nextAction: 'await_reply',
    rank: 3,
    approval: { ...ADA.approval, targetRevision: 'c'.repeat(64) },
  }),
]);

/** Seeds the queue query so the story never reaches the admin API. */
function SeededQuery({
  data,
  children,
}: Readonly<{ data: OutboundQueue; children: ReactNode }>) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  client.setQueryData(queryKeys.admin.outbound(), data);
  return (
    <QueryClientProvider client={client}>
      <RightPanelProvider>{children}</RightPanelProvider>
    </QueryClientProvider>
  );
}

const meta: Meta<typeof OutboundWorkspace> = {
  title: 'Admin/Outbound/Workspace',
  component: OutboundWorkspace,
  parameters: { layout: 'fullscreen' },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Queue: Story = {
  decorators: [
    Story => (
      <SeededQuery data={queue}>
        <div className='h-screen bg-base text-primary-token'>
          <Story />
        </div>
      </SeededQuery>
    ),
  ],
};

export const EmptyQueue: Story = {
  decorators: [
    Story => (
      <SeededQuery data={outboundFixtureQueue([])}>
        <div className='h-screen bg-base text-primary-token'>
          <Story />
        </div>
      </SeededQuery>
    ),
  ],
};
