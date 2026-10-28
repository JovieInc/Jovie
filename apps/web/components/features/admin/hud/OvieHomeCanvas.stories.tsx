import '@/app/globals.css';
import '@/styles/system-b-app.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import type { OvieInbox } from '@/lib/ovie/inbox';
import { INTERACTION_CASE_CONTRACT } from '@/lib/ovie/interaction-case';
import { OvieHomeCanvas } from './OvieHomeCanvas';

const INBOX: OvieInbox = {
  issues: [],
  cases: [
    {
      contract: INTERACTION_CASE_CONTRACT,
      id: 'summer:vercel-concurrency',
      kind: 'spend',
      source: { system: 'summer', id: 'vercel-concurrency', revision: null },
      title: 'Vercel on-demand concurrency for Jovie',
      recommendation: 'About $6 a month, at most $44. Recommended.',
      owner: null,
      state: 'needs_you',
      priority: 1,
      createdAt: '2026-10-20T18:00:00.000Z',
      nextAction: null,
      waitingUntil: null,
      confidence: null,
      evidence: [],
      body: 'Gives production and staging builds their own lane so preview floods cannot stall production.',
      decisionTarget: { kind: 'summer', id: 'vercel-concurrency' },
    },
  ],
};

/**
 * Network-free shell: the inbox answers from a fixture and shipping state is
 * unavailable, so the story shows real asks beside the reserved shipping
 * frames. Populated shipping visuals live in the HomeLoop organism stories.
 */
function StoryShell({ children }: { readonly children: ReactElement }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return (
    <QueryClientProvider client={client}>
      <div className='bg-base p-4 text-primary-token'>{children}</div>
    </QueryClientProvider>
  );
}

function stubHomeFetch() {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.includes('/api/ovie/inbox'))
      return new Response(JSON.stringify(INBOX), { status: 200 });
    if (url.includes('/api/hud/shipping-state'))
      return new Response('{}', { status: 503 });
    return realFetch(input, init);
  };
  return () => {
    globalThis.fetch = realFetch;
  };
}

const meta = {
  title: 'Features/Admin/Hud/OvieHomeCanvas',
  beforeEach: stubHomeFetch,
  component: OvieHomeCanvas,
  parameters: { layout: 'fullscreen' },
  decorators: [
    Story => (
      <StoryShell>
        <Story />
      </StoryShell>
    ),
  ],
} satisfies Meta<typeof OvieHomeCanvas>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AsksWithShippingUnavailable: Story = {};
