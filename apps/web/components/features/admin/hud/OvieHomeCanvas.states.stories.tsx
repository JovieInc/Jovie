import '@/app/globals.css';
import '@/styles/system-b-app.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { OvieHomeCanvas } from './OvieHomeCanvas';
import { COMPANY_RESPONSES } from './OvieHomeCanvas.test-fixtures';

type Answer = () => Promise<Response>;

const pending: Answer = () => new Promise<Response>(() => {});
const unavailable: Answer = async () => new Response('{}', { status: 503 });
const unreachable: Answer = async () => {
  throw new TypeError('Failed to fetch');
};

function json(body: unknown): Answer {
  return async () => Response.json(body);
}

/**
 * Answers every Home read for one story. Shipping state stays unavailable
 * unless the story says otherwise, so nothing reaches the API.
 */
function stubHome(rest: Answer = unavailable) {
  return () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      const url = new URL(String(input), window.location.href);
      if (url.pathname === '/api/hud/metrics')
        return json(COMPANY_RESPONSES['/api/hud/metrics'])();
      if (url.pathname === '/api/admin/hud/founder-funnel')
        return json(
          COMPANY_RESPONSES['/api/admin/hud/founder-funnel?range=7d']
        )();
      if (url.pathname === '/api/ovie/certifications')
        return json(COMPANY_RESPONSES['/api/ovie/certifications'])();
      if (url.pathname === '/api/ovie/home/blocker')
        return json(COMPANY_RESPONSES['/api/ovie/home/blocker'])();
      if (url.pathname.startsWith('/api/')) return rest();
      return originalFetch(input, init);
    };
    return () => {
      globalThis.fetch = originalFetch;
    };
  };
}

function HomeFrame({ dir = 'ltr' }: { readonly dir?: 'ltr' | 'rtl' }) {
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false } } })
  );
  return (
    <QueryClientProvider client={client}>
      <div dir={dir} className='min-h-dvh bg-base p-6 text-primary-token'>
        <OvieHomeCanvas />
      </div>
    </QueryClientProvider>
  );
}

const meta = {
  title: 'Features/Admin/Hud/OvieHomeCanvas States',
  component: OvieHomeCanvas,
  parameters: { layout: 'fullscreen' },
  render: () => <HomeFrame />,
} satisfies Meta<typeof OvieHomeCanvas>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Loading: no read has answered, so Story First holds skeletons. */
export const LoadingEverySection: Story = {
  beforeEach: stubHome(pending),
};

/** Empty: revenue clear, company glance measured, no in-flight work. */
export const EmptyClearBoard: Story = {
  beforeEach: stubHome(),
};

/** Error: every Home source answers 503. */
export const ErrorSourcesUnavailable: Story = {
  beforeEach: stubHome(unavailable),
};

/** Partial: blocker reads, company glance fails. */
export const PartialCompanyUnavailable: Story = {
  beforeEach: () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      const url = new URL(String(input), window.location.href);
      if (url.pathname === '/api/ovie/home/blocker')
        return Response.json(COMPANY_RESPONSES['/api/ovie/home/blocker']);
      if (url.pathname.startsWith('/api/')) return unavailable();
      return originalFetch(input, init);
    };
    return () => {
      globalThis.fetch = originalFetch;
    };
  },
};

/** Long content: long bottleneck copy + long highlight title. */
export const LongContentBottleneck: Story = {
  beforeEach: () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      const url = new URL(String(input), window.location.href);
      if (url.pathname === '/api/ovie/home/blocker')
        return Response.json({
          generatedAt: '2026-11-21T00:00:00.000Z',
          blocker: {
            schema: 'jovie.company-blocker/v1',
            id: 'certification:checkout_payment_entitlement',
            kind: 'certification',
            step: 'checkout_payment_entitlement',
            tone: 'bad',
            text: 'Checkout fails certification across entitlement, receipt delivery and the first-session unlock path, so nobody can pay yet and Summer will keep naming the same cone until payment is certified end to end',
            detailsHref: '/app/ov/certifications',
            since: '2026-11-18T00:00:00.000Z',
            nextAction:
              'Certify the full payment path including entitlement after Stripe confirms the charge',
            observedAt: '2026-11-21T00:00:00.000Z',
          },
        });
      if (url.pathname === '/api/hud/metrics')
        return Response.json(COMPANY_RESPONSES['/api/hud/metrics']);
      if (url.pathname === '/api/admin/hud/founder-funnel')
        return Response.json(
          COMPANY_RESPONSES['/api/admin/hud/founder-funnel?range=7d']
        );
      if (url.pathname === '/api/ovie/certifications')
        return Response.json(COMPANY_RESPONSES['/api/ovie/certifications']);
      if (url.pathname.startsWith('/api/')) return unavailable();
      return originalFetch(input, init);
    };
    return () => {
      globalThis.fetch = originalFetch;
    };
  },
};

/** Offline: no request can leave the browser. */
export const OfflineNothingReachable: Story = {
  beforeEach: stubHome(unreachable),
};

/** RTL: Story First in a right-to-left container. */
export const RtlArabic: Story = {
  beforeEach: stubHome(),
  render: () => <HomeFrame dir='rtl' />,
};
