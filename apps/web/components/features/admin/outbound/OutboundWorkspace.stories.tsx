import '@/styles/system-b-app.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { RightPanelProvider } from '@/contexts/RightPanelContext';
import type { OutboundReadiness } from '@/lib/outbound/readiness';
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
    fitScore: 82,
    whyNow: null,
    fit: 'unknown',
    fitBasis: 'presence_only',
    flags: ['possible_non_artist', 'presence_only_fit'],
    entityNote: 'Looks like a playlist curator or submission service',
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

const readiness: OutboundReadiness = {
  generatedAt: '2026-10-04T12:00:00Z',
  ready: 1,
  total: 2,
  items: [
    {
      id: 'certifications',
      label: 'Certifications cleared',
      status: 'green',
      detail: 'No people waiting on fact review',
      owner: 'outbound',
      href: null,
    },
    {
      id: 'cone',
      label: 'Revenue cone: acquisition eligible',
      status: 'red',
      detail: '1 of 8 receipts not green',
      owner: 'revenue',
      href: null,
    },
  ],
};

/** Seeds the queue and readiness queries so the story never reaches the admin API. */
function SeededQuery({
  data,
  children,
}: Readonly<{ data: OutboundQueue; children: ReactNode }>) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  client.setQueryData(queryKeys.admin.outbound(), data);
  client.setQueryData(queryKeys.admin.outboundReadiness(), readiness);
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
