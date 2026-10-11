import { TooltipProvider } from '@jovie/ui';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { RightPanelProvider } from '@/contexts/RightPanelContext';
import type { OvieCertificationInventory } from '@/lib/ovie/certifications/types';
import { queryKeys } from '@/lib/queries/keys';
import { OvieCertificationsWorkspace } from './OvieCertificationsWorkspace';

// No admission packets exist in this state. Keep this fixture browser-safe;
// the packet factory evaluates admission using Node crypto.
const inventory: OvieCertificationInventory = {
  contract: 'jovie.ovie-certification-inventory/v1',
  generatedAt: '2026-10-02T06:00:00.000Z',
  universal: false,
  domains: [
    {
      domain: 'flows',
      label: 'Flows',
      status: 'error',
      rowCount: 0,
      note: 'Inventory read failed.',
    },
  ],
  counts: {
    working: 0,
    review_ready: 0,
    founder_locked: 0,
    shipped: 0,
    monitored: 0,
    total: 0,
  },
  queue: {
    contract: 'jovie.certification-inbox/v1',
    needsYou: [],
    blocked: [],
    stale: [],
    returned: [],
    certified: [],
    superseded: [],
  },
  rows: [],
  issues: [
    { domain: 'flows', source: 'inventory', message: 'Inventory read failed.' },
  ],
};

function UnavailableWorkspace() {
  const [client] = useState(() => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });
    const key = queryKeys.admin.certifications();
    queryClient.setQueryDefaults(key, { enabled: false });
    queryClient.setQueryData(key, inventory);
    return queryClient;
  });
  return (
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <RightPanelProvider>
          <div className='h-180 bg-(--app-shell-content-surface)'>
            <OvieCertificationsWorkspace />
          </div>
        </RightPanelProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

const meta = {
  title: 'Features/Admin/Certifications/Unavailable',
  component: OvieCertificationsWorkspace,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof OvieCertificationsWorkspace>;
export default meta;
type Story = StoryObj<typeof meta>;
export const FailedSource: Story = { render: () => <UnavailableWorkspace /> };
