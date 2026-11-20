import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { SHIPPING_STATE_SCHEMA } from '@/lib/ovie/shipping-state-client';
import { OvieShippingStateCard } from './OvieShippingStateCard';

const SHIPPING_PATH = '/api/hud/shipping-state';

const count = (value: number) =>
  value === 0
    ? { state: 'measured-zero', value: 0 }
    : { state: 'measured-nonzero', value };
const unmeasured = { state: 'not-measured', value: null };

function delivery(scale: number, alerts: string[]) {
  const now = Date.now();
  return {
    lanes: {
      running: count(7 * scale),
      slots: count(9 * scale),
      idle: count(2 * scale),
      pool: count(186 * scale),
      lastLandingAgeSeconds: count(85),
      diskFreePct: 28.4,
      lanes:
        scale === 0
          ? []
          : [
              { name: 'devin', running: 4 * scale, slots: 4 * scale },
              { name: 'codex', running: 3 * scale, slots: 3 * scale },
              { name: 'hyperagent', running: 0, slots: 2 * scale },
            ],
      alerts,
      heldByReason: {},
      failedByReason: {},
      publishedAt: new Date(now - 60_000).toISOString(),
      stale: false,
    },
    merges: {
      since: '2026-09-26T07:00:00Z',
      today: count(292 * scale),
      byRepo: {
        Jovie: count(189 * scale),
        LogYourBody: count(17 * scale),
        'summer-config': count(26 * scale),
      },
      last7Days: count(862 * scale),
      prior7Days: count(225 * scale),
    },
    mergeQueueDepth: count(2 * scale),
    inFlight: count(0),
    certifiedHead: {
      sha: 'c3e74e00a9d234b8f6a1b2c3d4e5f60718293a4b',
      certifiedAt: new Date(now - 1_800_000).toISOString(),
    },
    production: {
      sha: 'ee7401f37e0b324e225751f0d97ce229838ac8b4',
      version: '26.9.15',
      deployedAt: new Date(now - 3_600_000).toISOString(),
      behindMain: count(54 * scale),
    },
    staging: {
      sha: 'a1b2c3d4e5f60718293a4bc3e74e00a9d234b8f6',
      version: '26.9.16',
      deployedAt: new Date(now - 1_200_000).toISOString(),
      behindMain: count(2 * scale),
    },
    summer: { availability: 'up' },
  };
}

/** A fresh `ovie.shipping-state.v1` read, stamped when the story asks. */
function projection(overrides: Record<string, unknown> = {}) {
  const now = Date.now();
  return {
    schema: SHIPPING_STATE_SCHEMA,
    projectionId: 'proj-1',
    eventId: 'proj-1',
    sequence: 4,
    producerId: 'ubuntu-operational-truth',
    producerVersion: '1',
    sourceId: 'lanes-status',
    entityId: 'ovie.shipping-state',
    cursor: '4',
    sourceRevision: 'rev-4',
    observationTimestamp: new Date(now).toISOString(),
    emissionTimestamp: new Date(now).toISOString(),
    freshnessDeadline: new Date(now + 3_600_000).toISOString(),
    correlation: { workId: 'corr-4' },
    lastError: null,
    state: 'fresh',
    publishing: true,
    sources: {},
    delivery: delivery(1, ['61 harness-failed runs in 24h']),
    meanings: {
      merged: { state: 'measured', value: false },
      queued: { state: 'measured', value: true },
      ciGreen: { state: 'measured', value: true },
      productionVerified: { state: 'measured', value: true },
      exactLiveBuild: { state: 'measured', value: true },
    },
    ...overrides,
  };
}

/** Answers the shipping-state poll for one story; nothing reaches the API. */
function stubShipping(answer: () => Promise<Response>) {
  return () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      const url = new URL(String(input), window.location.href);
      if (url.pathname === SHIPPING_PATH) return answer();
      return originalFetch(input, init);
    };
    return () => {
      globalThis.fetch = originalFetch;
    };
  };
}

function CardFrame({ dir = 'ltr' }: { readonly dir?: 'ltr' | 'rtl' }) {
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false } } })
  );
  return (
    <QueryClientProvider client={client}>
      <div dir={dir} className='w-80 bg-base p-4 text-primary-token'>
        <OvieShippingStateCard />
      </div>
    </QueryClientProvider>
  );
}

function renderCard() {
  return <CardFrame />;
}

const meta = {
  title: 'Features/Admin/Hud/OvieShippingStateCard States',
  component: OvieShippingStateCard,
  parameters: { layout: 'centered' },
  render: renderCard,
} satisfies Meta<typeof OvieShippingStateCard>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Loading: the first poll has not answered; every metric reads Unknown. */
export const LoadingFirstPoll: Story = {
  beforeEach: stubShipping(() => new Promise<Response>(() => {})),
};

/** Empty: a fresh read where every count is a measured zero. */
export const EmptyMeasuredZero: Story = {
  beforeEach: stubShipping(async () =>
    Response.json(projection({ delivery: delivery(0, []) }))
  ),
};

/** Partial: GitHub is down, so merge metrics read Unknown with their source. */
export const PartialGitHubSourceMissing: Story = {
  beforeEach: stubShipping(async () => {
    const base = delivery(1, []);
    return Response.json(
      projection({
        state: 'partial',
        lastError: {
          at: new Date().toISOString(),
          code: 'unavailable',
          message: 'GitHub GraphQL returned 502',
        },
        delivery: {
          ...base,
          merges: {
            since: null,
            today: unmeasured,
            byRepo: {
              Jovie: unmeasured,
              LogYourBody: unmeasured,
              'summer-config': unmeasured,
            },
            last7Days: unmeasured,
            prior7Days: unmeasured,
          },
          lanes: { ...base.lanes, stale: true },
        },
      })
    );
  }),
};

/** Offline: the poll cannot leave the browser, so the card is disconnected. */
export const OfflineDisconnected: Story = {
  beforeEach: stubShipping(async () => {
    throw new TypeError('Failed to fetch');
  }),
};

/** Permission denied: the API answers 401 before any successful read. */
export const PermissionDeniedUnauthorized: Story = {
  beforeEach: stubShipping(async () =>
    Response.json({ error: 'Unauthorized' }, { status: 401 })
  ),
};

/** Long content: five-figure counts, long alerts and a long source revision. */
export const LongContentLargeCounts: Story = {
  beforeEach: stubShipping(async () =>
    Response.json(
      projection({
        sourceRevision:
          'rev-2026-09-27T18-42-11Z-ubuntu-operational-truth-lanes-status-0f3a9c1d',
        delivery: delivery(137, [
          '6,112 harness-failed runs in 24h across every lane and repository',
          'disk below the cleanup threshold on three runners',
          'merge queue paused twice for a required-check outage',
        ]),
      })
    )
  ),
};

function renderRtl() {
  return <CardFrame dir='rtl' />;
}

/** RTL: the metric grid mirrors in a right-to-left container. */
export const RtlDeliveryCard: Story = {
  beforeEach: stubShipping(async () =>
    Response.json(
      projection({
        delivery: delivery(1, ['فشل ٦١ تشغيلًا خلال آخر ٢٤ ساعة']),
      })
    )
  ),
  render: renderRtl,
};
