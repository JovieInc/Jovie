import { TooltipProvider } from '@jovie/ui';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { fixtureInventory } from '@/lib/ovie/certifications/fixtures';
import type { OvieCertificationInventory } from '@/lib/ovie/certifications/types';
import { CertificationJudgments } from './CertificationJudgments';

const ENDPOINT = '/api/ovie/certifications';

/** Answers the certifications read for one story; nothing reaches the API. */
function stubCertifications(answer: () => Promise<Response>) {
  return () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      const url = new URL(String(input), window.location.href);
      if (url.pathname === ENDPOINT) return answer();
      return originalFetch(input, init);
    };
    return () => {
      globalThis.fetch = originalFetch;
    };
  };
}

const answerWith = (data: OvieCertificationInventory) => async () =>
  Response.json(data);

function Frame({ dir = 'ltr' }: Readonly<{ dir?: 'ltr' | 'rtl' }>) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: false },
          mutations: { retry: false },
        },
      })
  );
  return (
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <div
          dir={dir}
          className='w-full max-w-md bg-(--app-shell-content-surface) p-3 text-primary-token'
        >
          <CertificationJudgments />
        </div>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

const inventory = fixtureInventory();

const meta = {
  title: 'Features/Admin/CertificationJudgments/States',
  component: Frame,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof Frame>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: no domain is connected, so no judgment queue exists. */
export const EmptyNoConnectedDomains: Story = {
  beforeEach: stubCertifications(
    answerWith({
      ...inventory,
      domains: inventory.domains.map(domain => ({
        ...domain,
        status: 'not_connected' as const,
        rowCount: 0,
      })),
      queue: { ...inventory.queue, needsYou: [] },
      rows: [],
    })
  ),
};

/** Error: the read fails, so the panel offers a retry. */
export const ErrorLoadFailed: Story = {
  beforeEach: stubCertifications(
    async () => new Response('nope', { status: 500 })
  ),
};

/** Long content: a judgment subject title far past one line. */
export const LongContentTitle: Story = {
  beforeEach: stubCertifications(
    answerWith({
      ...inventory,
      queue: {
        ...inventory.queue,
        needsYou: inventory.queue.needsYou.map(item => ({
          ...item,
          subject: {
            ...item.subject,
            title:
              'Golden path signup flow for artists arriving from a very long campaign link with several parameters',
          },
        })),
      },
    })
  ),
};

/** Offline: the network is down, so the read rejects. */
export const Offline: Story = {
  beforeEach: stubCertifications(async () => {
    throw new TypeError('Failed to fetch');
  }),
};

/** PermissionDenied: the admin session is locked and asks for a passkey. */
export const PermissionDenied: Story = {
  beforeEach: stubCertifications(
    async () => new Response('Forbidden', { status: 403 })
  ),
};

/** Rtl: right-to-left layout keeps the judgment row and actions aligned. */
export const RtlOverflow: Story = {
  beforeEach: stubCertifications(answerWith(inventory)),
  render: () => <Frame dir='rtl' />,
};
