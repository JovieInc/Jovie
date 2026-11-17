import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { MergedPipelineBottleneck } from '@/lib/ovie/pipeline-bottleneck';
import { bottleneckFixture } from '@/lib/ovie/pipeline-bottleneck.fixtures';
import { queryKeys } from '@/lib/queries/keys';
import { PipelineBottleneckBanner } from './PipelineBottleneckBanner';

type StateName = 'clear' | 'error' | 'long' | 'rtl' | 'agentic';

const key = queryKeys.hud.pipelineBottleneck();

function dataFor(state: StateName): MergedPipelineBottleneck {
  if (state === 'clear')
    return bottleneckFixture({ status: 'clear', rank1: null });
  if (state === 'long')
    return bottleneckFixture({
      status: 'needs-you',
      rank1: {
        id: 'runner-memory',
        title: 'Runner memory and queue capacity across every shard',
        oneLine:
          'Runner memory is limiting concurrent repairs across every shard, so qualified repairs wait in the queue for more than an hour before a runner picks them up.',
      },
      metric: 'Runner memory 94% sustained over the last six hours',
      cost: {
        item: 'Runner memory upgrade for every repair shard',
        monthlyUsd: 240,
      },
      impact:
        'Adds capacity for twelve concurrent repairs and clears the queue within the hour.',
    });
  if (state === 'rtl')
    return bottleneckFixture({
      rank1: {
        id: 'runner-capacity',
        title: 'سعة المشغل',
        oneLine: 'الإصلاحات المؤهلة تنتظر سعة المشغل.',
      },
      metric: 'العمل في الانتظار 2',
    });
  return bottleneckFixture();
}

function createClient(state: StateName) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  if (state === 'error') {
    client
      .getQueryCache()
      .build(client, { queryKey: key })
      .setState({
        status: 'error',
        error: new Error('Bottleneck read failed'),
        fetchStatus: 'idle',
      });
  } else {
    client.setQueryData(key, dataFor(state));
  }
  return client;
}

function Shell({
  children,
  client,
}: {
  readonly children: ReactNode;
  readonly client: QueryClient;
}) {
  return (
    <QueryClientProvider client={client}>
      <div className='w-full bg-base p-4 text-primary-token'>
        <div className='h-20'>{children}</div>
      </div>
    </QueryClientProvider>
  );
}

const meta = {
  title: 'Features/Home/PipelineBottleneckBanner States',
  component: PipelineBottleneckBanner,
  parameters: { layout: 'fullscreen', bottleneckState: 'agentic' },
  args: { isAdmin: true },
  loaders: [
    ({ parameters }) => ({
      bottleneckClient: createClient(parameters.bottleneckState as StateName),
    }),
  ],
  decorators: [
    function MetaDecorator(Story, context) {
      return (
        <Shell key={context.id} client={context.loaded.bottleneckClient}>
          <Story />
        </Shell>
      );
    },
  ],
} satisfies Meta<typeof PipelineBottleneckBanner>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: nothing is blocking the pipeline. */
export const EmptyNoBottleneck: Story = {
  parameters: { bottleneckState: 'clear' },
};

/** Error: the bottleneck read failed, so the slot stays quiet. */
export const ErrorReadFailed: Story = {
  parameters: { bottleneckState: 'error' },
};

/** Long content: a long cause, metric, cost and impact, each truncated. */
export const LongContent: Story = {
  parameters: { bottleneckState: 'long' },
};

/** Permission denied: a non-admin never sees the banner. */
export const PermissionDeniedNonAdmin: Story = {
  args: { isAdmin: false },
};

/** Rtl: Arabic bottleneck copy in a right-to-left document. */
export const Rtl: Story = {
  parameters: { bottleneckState: 'rtl' },
  decorators: [
    function RtlDecorator(Story) {
      return (
        <div dir='rtl' lang='ar'>
          <Story />
        </div>
      );
    },
  ],
};
