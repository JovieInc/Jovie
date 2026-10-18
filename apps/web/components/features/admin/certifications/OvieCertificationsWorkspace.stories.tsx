import '@/styles/system-b-app.css';
import { TooltipProvider } from '@jovie/ui';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useMemo } from 'react';
import { userEvent, within } from 'storybook/test';
import {
  RightPanelProvider,
  useRightPanel,
} from '@/contexts/RightPanelContext';
import {
  fixtureInventory,
  fixtureRow,
} from '@/lib/ovie/certifications/fixtures';
import { countCertificationStates } from '@/lib/ovie/certifications/normalize';
import {
  OVIE_CERTIFICATION_DOMAIN_LABELS,
  OVIE_CERTIFICATION_DOMAINS,
  type OvieCertificationInventory,
} from '@/lib/ovie/certifications/types';
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

const baseInventory = fixtureInventory();
const inventory = {
  ...baseInventory,
  rows: baseInventory.rows.map((row, index) => ({
    ...row,
    owner: index === 0 ? 'Summer' : null,
  })),
  domains: OVIE_CERTIFICATION_DOMAINS.map(
    domain =>
      baseInventory.domains.find(item => item.domain === domain) ?? {
        domain,
        label: OVIE_CERTIFICATION_DOMAIN_LABELS[domain],
        status: 'empty' as const,
        rowCount: 0,
        note: 'No committed packets yet.',
      }
  ),
};
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

const crossDomainRows = [
  ...inventory.rows,
  ...(['company', 'design_system', 'icps', 'outcomes'] as const).map(
    domain => ({
      ...fixtureRow(domain, {
        domain,
        surface: OVIE_CERTIFICATION_DOMAIN_LABELS[domain],
      }),
      owner: 'Summer',
    })
  ),
];
export const CrossDomain: Story = {
  render: () => (
    <WorkspaceStory
      inventory={{
        ...inventory,
        rows: crossDomainRows,
        counts: countCertificationStates(crossDomainRows),
        domains: inventory.domains.map(item => {
          const rowCount = crossDomainRows.filter(
            row => row.domain === item.domain
          ).length;
          return rowCount
            ? { ...item, rowCount, status: 'connected', note: null }
            : item;
        }),
      }}
    />
  ),
};
