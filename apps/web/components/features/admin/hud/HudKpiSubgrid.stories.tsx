import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import type {
  DailyBucket,
  ShippingVelocityResponse,
} from '@/app/api/admin/hud/shipping-velocity/route';
import type { HudMetrics } from '@/types/hud';
import { HudKpiSubgrid } from './HudKpiSubgrid';

const QUERY_KEY = ['hud', 'kpi', 'shipping-velocity', '30d'];
const VELOCITY_PATH = '/api/admin/hud/shipping-velocity';

// Only the slices the tiles read; the full HudMetrics payload is server-built.
function metrics(
  running: number,
  queued: number,
  review: number,
  open: number
): HudMetrics {
  return {
    aiOps: {
      counts: { running, queued, review },
      mergeQueue: { openAgentPrs: open, openAgentPrThreshold: 12 },
    },
  } as unknown as HudMetrics;
}

function buckets(scale: number): DailyBucket[] {
  return Array.from({ length: 30 }, (_, index) => ({
    date: `2026-09-${String(index + 1).padStart(2, '0')}`,
    merged: (4 + (index % 5) + Math.floor(index / 6)) * scale,
    opened: 6 * scale,
    closed: scale,
    mergeP50Hours: (3 + (index % 4)) * scale,
  }));
}

function velocity(
  data: DailyBucket[],
  observation: ShippingVelocityResponse['observation']
): ShippingVelocityResponse {
  return {
    data,
    range: '30d',
    cachedAt: '2026-09-30T12:00:00.000Z',
    observation,
  };
}

/** Answers the velocity request for one story; nothing reaches the API. */
function stubVelocity(answer: () => Promise<Response>) {
  return () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      const url = new URL(String(input), window.location.href);
      if (url.pathname === VELOCITY_PATH) return answer();
      return originalFetch(input, init);
    };
    return () => {
      globalThis.fetch = originalFetch;
    };
  };
}

const answerWith = (payload: ShippingVelocityResponse) => async () =>
  Response.json(payload);

interface KpiStoryProps {
  readonly metrics: HudMetrics;
  readonly seed?: ShippingVelocityResponse;
  readonly dir?: 'ltr' | 'rtl';
}

function KpiStory({ metrics: value, seed, dir = 'ltr' }: KpiStoryProps) {
  const [client] = useState(() => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    if (seed) queryClient.setQueryData(QUERY_KEY, seed);
    return queryClient;
  });
  return (
    <QueryClientProvider client={client}>
      <div dir={dir} className='w-full max-w-3xl'>
        <HudKpiSubgrid metrics={value} />
      </div>
    </QueryClientProvider>
  );
}

const measured = velocity(buckets(1), 'fresh');
const empty = velocity([], 'empty');
const large = velocity(buckets(1200), 'fresh');

const meta = {
  title: 'Features/Admin/Hud/HudKpiSubgrid',
  component: HudKpiSubgrid,
  parameters: { layout: 'centered' },
  args: { metrics: metrics(3, 5, 2, 4) },
} satisfies Meta<typeof HudKpiSubgrid>;

export default meta;
type Story = StoryObj<typeof meta>;

function renderMeasured(args: { readonly metrics: HudMetrics }) {
  return <KpiStory metrics={args.metrics} seed={measured} />;
}

export const Default: Story = {
  beforeEach: stubVelocity(answerWith(measured)),
  render: renderMeasured,
};

function renderUnseeded(args: { readonly metrics: HudMetrics }) {
  return <KpiStory metrics={args.metrics} />;
}

/** Loading: the velocity request never answers, so both tiles hold a dash. */
export const LoadingVelocity: Story = {
  beforeEach: stubVelocity(() => new Promise<Response>(() => {})),
  render: renderUnseeded,
};

function renderEmpty(args: { readonly metrics: HudMetrics }) {
  return <KpiStory metrics={args.metrics} seed={empty} />;
}

/** Empty: a successful observation with no buckets and no agents running. */
export const EmptyNoMerges: Story = {
  args: { metrics: metrics(0, 0, 0, 0) },
  beforeEach: stubVelocity(answerWith(empty)),
  render: renderEmpty,
};

/** Offline: the request fails, so velocity stays unmeasured. */
export const OfflineVelocityUnreachable: Story = {
  beforeEach: stubVelocity(async () => {
    throw new TypeError('Failed to fetch');
  }),
  render: renderUnseeded,
};

function renderLarge(args: { readonly metrics: HudMetrics }) {
  return <KpiStory metrics={args.metrics} seed={large} />;
}

/** Long content: five-figure counts and multi-day merge times. */
export const LongContentLargeCounts: Story = {
  args: { metrics: metrics(12840, 98211, 40312, 7718) },
  beforeEach: stubVelocity(answerWith(large)),
  render: renderLarge,
};

function renderRtl(args: { readonly metrics: HudMetrics }) {
  return <KpiStory metrics={args.metrics} seed={measured} dir='rtl' />;
}

/** RTL: the three tiles mirror in a right-to-left container. */
export const RtlTiles: Story = {
  beforeEach: stubVelocity(answerWith(measured)),
  render: renderRtl,
};
