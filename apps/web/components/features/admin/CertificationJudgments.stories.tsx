import { TooltipProvider } from '@jovie/ui';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useMemo } from 'react';
import { fixtureInventory } from '@/lib/ovie/certifications/fixtures';
import type { OvieCertificationInventory } from '@/lib/ovie/certifications/types';
import { queryKeys } from '@/lib/queries/keys';
import { CertificationJudgments } from './CertificationJudgments';

function createStoryQueryClient(
  inventory: OvieCertificationInventory | undefined
): QueryClient {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity },
      mutations: { retry: false },
    },
  });
  const key = queryKeys.admin.certifications();
  client.setQueryDefaults(key, { enabled: false, staleTime: Infinity });
  if (inventory) client.setQueryData(key, inventory);
  return client;
}

function JudgmentsStory({
  inventory,
}: {
  readonly inventory?: OvieCertificationInventory;
}) {
  const client = useMemo(() => createStoryQueryClient(inventory), [inventory]);
  return (
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <div className='w-105 bg-(--app-shell-content-surface) p-3 text-primary-token'>
          <CertificationJudgments />
        </div>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

const inventory = fixtureInventory();
const noCoverageInventory: OvieCertificationInventory = {
  ...inventory,
  domains: inventory.domains.map(domain => ({
    ...domain,
    status: 'not_connected' as const,
    rowCount: 0,
  })),
  queue: { ...inventory.queue, needsYou: [] },
  rows: [],
};

const meta = {
  title: 'Features/Admin/CertificationJudgments',
  component: CertificationJudgments,
  parameters: {
    layout: 'centered',
    viewport: { defaultViewport: 'desktop' },
    jovie: {
      // Internal JudgmentRow props; the exported component is prop-less and
      // driven by the certifications query.
      uncoveredProps: [
        'item',
        'row',
        'pendingKind',
        'onDecide',
        'kind',
        'notes',
      ],
    },
  },
} satisfies Meta<typeof CertificationJudgments>;

export default meta;
type Story = StoryObj<typeof meta>;

export const PendingJudgment: Story = {
  render: () => <JudgmentsStory inventory={inventory} />,
};

export const NoConnectedDomains: Story = {
  render: () => <JudgmentsStory inventory={noCoverageInventory} />,
};

export const Loading: Story = {
  render: () => <JudgmentsStory />,
};
