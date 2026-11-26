import '@/app/globals.css';
import '@/styles/system-b-app.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { emptyDeliverySummary } from '@/lib/ovie/shipping-state/contract';
import { OvieHomeCanvas } from './OvieHomeCanvas';
import { COMPANY_RESPONSES, snapshot } from './OvieHomeCanvas.test-fixtures';

/**
 * Network-free Story First shell: company + blocker answer from fixtures;
 * shipping comes from the HUD query mock path when unavailable.
 */
function StoryShell({ children }: { readonly children: ReactElement }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return (
    <QueryClientProvider client={client}>
      <div className='min-h-dvh bg-base p-6 text-primary-token'>{children}</div>
    </QueryClientProvider>
  );
}

function stubHomeFetch(overrides: Record<string, unknown> = {}) {
  const responses = { ...COMPANY_RESPONSES, ...overrides };
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input.toString();
    for (const [path, body] of Object.entries(responses)) {
      if (
        url.includes(path) ||
        url.endsWith(path) ||
        url.includes(path.replace(/^\//, ''))
      )
        return new Response(JSON.stringify(body), { status: 200 });
    }
    if (url.includes('/api/hud/metrics'))
      return new Response(JSON.stringify(responses['/api/hud/metrics']), {
        status: 200,
      });
    if (url.includes('/api/admin/hud/founder-funnel'))
      return new Response(
        JSON.stringify(responses['/api/admin/hud/founder-funnel?range=7d']),
        { status: 200 }
      );
    if (url.includes('/api/ovie/certifications'))
      return new Response(
        JSON.stringify(responses['/api/ovie/certifications']),
        {
          status: 200,
        }
      );
    if (url.includes('/api/ovie/home/blocker'))
      return new Response(JSON.stringify(responses['/api/ovie/home/blocker']), {
        status: 200,
      });
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
  beforeEach: () => stubHomeFetch(),
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

export const StoryFirstFlat: Story = {};

export const StoryFirstFlatBottleneck: Story = {
  beforeEach: () =>
    stubHomeFetch({
      '/api/ovie/home/blocker': {
        generatedAt: '2026-11-21T00:00:00.000Z',
        blocker: {
          schema: 'jovie.company-blocker/v1',
          id: 'certification:checkout_payment_entitlement',
          kind: 'certification',
          step: 'checkout_payment_entitlement',
          tone: 'bad',
          text: 'Checkout fails certification, so nobody can pay yet',
          detailsHref: '/app/ov/certifications',
          since: '2026-11-18T00:00:00.000Z',
          nextAction: 'Certify payment path',
          observedAt: '2026-11-21T00:00:00.000Z',
        },
      },
    }),
};

export const StoryFirstFlatMelt: Story = {
  args: {
    chat: {
      messages: [
        {
          id: 'u1',
          role: 'user',
          parts: [{ type: 'text', text: 'Why is checkout blocking revenue?' }],
        },
      ],
      isStreaming: false,
      composerHasIntent: true,
      onOpenTranscript: () => undefined,
    },
  },
};

/** Kept for Chromatic identity; shipping feed empty so glance stays quiet. */
export const QuietShipping: Story = {
  loaders: [
    async () => {
      // Ensure empty delivery shape is referenced for story authors.
      void emptyDeliverySummary();
      void snapshot();
      return {};
    },
  ],
};
