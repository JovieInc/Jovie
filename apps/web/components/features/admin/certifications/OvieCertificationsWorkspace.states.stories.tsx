import '@/styles/system-b-app.css';
import { TooltipProvider } from '@jovie/ui';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useMemo } from 'react';
import {
  RightPanelProvider,
  useRightPanel,
} from '@/contexts/RightPanelContext';
import { fixtureInventory } from '@/lib/ovie/certifications/fixtures';
import type { OvieCertificationInventory } from '@/lib/ovie/certifications/types';
import { queryKeys } from '@/lib/queries/keys';
import { OvieCertificationsWorkspace } from './OvieCertificationsWorkspace';

/**
 * Seeds the certifications query the same way the base stories do (fetch
 * disabled, data set up front), and can also record a failed read, so error
 * and offline states render without a network.
 */
function createStoryQueryClient(
  inventory: OvieCertificationInventory | undefined,
  failed: boolean
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
  if (failed) {
    client
      .getQueryCache()
      .build(client, { queryKey: key })
      .setState({
        status: 'error',
        error: new Error('Certification inventory read failed'),
        errorUpdateCount: 1,
        fetchStatus: 'idle',
      });
  }
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
  failed = false,
}: {
  readonly inventory?: OvieCertificationInventory;
  readonly failed?: boolean;
}) {
  const client = useMemo(
    () => createStoryQueryClient(inventory, failed),
    [inventory, failed]
  );
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

const meta = {
  title: 'Features/Admin/Certifications/OvieCertificationsWorkspace States',
  component: OvieCertificationsWorkspace,
  parameters: {
    layout: 'fullscreen',
    viewport: { defaultViewport: 'desktop' },
  },
} satisfies Meta<typeof OvieCertificationsWorkspace>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Error: the first inventory read failed; Retry is offered. */
export const ErrorFirstLoad: Story = {
  render: () => <WorkspaceStory failed />,
};

/** Error: every domain failed to load, so no item can be claimed absent. */
export const ErrorDomainsFailed: Story = {
  render: function ErrorDomainsFailedRender() {
    return (
      <WorkspaceStory
        inventory={{
          ...inventory,
          rows: [],
          domains: inventory.domains.map(domain => ({
            ...domain,
            status: 'error',
          })),
        }}
      />
    );
  },
};

/** Offline: a background refresh failed, so the last inventory is marked stale. */
export const OfflineRefreshFailed: Story = {
  render: () => <WorkspaceStory inventory={inventory} failed />,
};

const longRows = Array.from({ length: 6 }, (_, copy) =>
  inventory.rows.map(row => ({
    ...row,
    id: `${row.id}-${copy}`,
    owner: 'Design systems and certification working group',
    subject: {
      ...row.subject,
      title: `${row.subject.title} through claim, onboarding chat, verification and the first paid plan ${copy + 1}`,
    },
  }))
).flat();

/** Long content: many rows with long titles truncate inside the table. */
export const LongContentRows: Story = {
  render: () => <WorkspaceStory inventory={{ ...inventory, rows: longRows }} />,
};

/** Right-to-left: the workspace inside an RTL document. */
export const RtlDocument: Story = {
  render: function RtlDocumentRender() {
    return (
      <div dir='rtl'>
        <WorkspaceStory inventory={inventory} />
      </div>
    );
  },
};
