import { TooltipProvider } from '@jovie/ui';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useMemo } from 'react';
import { userEvent, within } from 'storybook/test';
import {
  RightPanelProvider,
  useRightPanel,
} from '@/contexts/RightPanelContext';
import { fixtureInventory } from '@/lib/ovie/certifications/fixtures';
import type { OvieCertificationInventory } from '@/lib/ovie/certifications/types';
import { queryKeys } from '@/lib/queries/keys';
import { OvieCertificationsWorkspace } from './OvieCertificationsWorkspace';

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

function WorkspaceCanvas() {
  const rightPanel = useRightPanel();
  return (
    <div className='flex h-180 min-w-0 bg-(--app-shell-content-surface) text-primary-token'>
      <div className='min-w-0 flex-1'>
        <OvieCertificationsWorkspace />
      </div>
      {rightPanel}
    </div>
  );
}

function WorkspaceStory({
  inventory,
}: {
  readonly inventory?: OvieCertificationInventory;
}) {
  const client = useMemo(() => createStoryQueryClient(inventory), [inventory]);
  return (
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <RightPanelProvider>
          <WorkspaceCanvas />
        </RightPanelProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

const inventory = fixtureInventory();
const emptyInventory: OvieCertificationInventory = {
  ...inventory,
  counts: {
    working: 0,
    review_ready: 0,
    founder_locked: 0,
    shipped: 0,
    monitored: 0,
    total: 0,
  },
  rows: [],
};

const meta = {
  title: 'Features/Admin/Certifications/OvieCertificationsWorkspace',
  component: OvieCertificationsWorkspace,
  parameters: {
    layout: 'fullscreen',
    viewport: { defaultViewport: 'desktop' },
  },
} satisfies Meta<typeof OvieCertificationsWorkspace>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ReviewQueue: Story = {
  render: () => <WorkspaceStory inventory={inventory} />,
  play: async ({ canvasElement }) => {
    await userEvent.click(
      await within(canvasElement).findByText('Flow signup-golden-path')
    );
  },
};

export const Empty: Story = {
  render: () => <WorkspaceStory inventory={emptyInventory} />,
};

export const Loading: Story = {
  render: () => <WorkspaceStory />,
};
