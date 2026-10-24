import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { expect, waitFor, within } from 'storybook/test';
import {
  bottleneckFixture,
  contributionFixture,
} from '@/lib/ovie/pipeline-bottleneck.fixtures';
import { queryKeys } from '@/lib/queries/keys';
import { PipelineBottleneckBanner } from './PipelineBottleneckBanner';

type State = 'agentic' | 'needs-you' | 'clear' | 'missing' | 'stale';
function createStoryClient(state: State) {
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const loop = contributionFixture();
  const data =
    state === 'missing'
      ? null
      : bottleneckFixture({
          ...(state === 'needs-you'
            ? {
                status: 'needs-you',
                cost: loop.cost!,
                impact: loop.impact!,
                rank1: loop.rank1Override!,
              }
            : {}),
          ...(state === 'clear' ? { status: 'clear', rank1: null } : {}),
          ...(state === 'stale' ? { observedAt: '2020-01-01T00:00:00Z' } : {}),
        });
  cache.setQueryData(queryKeys.hud.pipelineBottleneck(), data);
  return cache;
}

function StoryShell({
  children,
  client,
}: {
  readonly children: ReactNode;
  readonly client: QueryClient;
}) {
  return (
    <QueryClientProvider client={client}>
      <div className='w-full bg-base p-4 text-primary-token'>
        <div className='h-20' data-testid='banner-slot'>
          {children}
        </div>
      </div>
    </QueryClientProvider>
  );
}

const meta = {
  title: 'Features/Home/PipelineBottleneckBanner',
  component: PipelineBottleneckBanner,
  parameters: { layout: 'fullscreen', bottleneckState: 'agentic' },
  args: { isAdmin: true },
  loaders: [
    ({ parameters }) => ({
      bottleneckClient: createStoryClient(parameters.bottleneckState),
    }),
  ],
  decorators: [
    (Story, context) => (
      <StoryShell key={context.id} client={context.loaded.bottleneckClient}>
        <Story />
      </StoryShell>
    ),
  ],
} satisfies Meta<typeof PipelineBottleneckBanner>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Agentic: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Agentic')).toBeVisible();
    await expect(canvas.getByText('Agents on it')).toBeVisible();
  },
};
export const NeedsYou: Story = {
  parameters: { bottleneckState: 'needs-you' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Needs you')).toBeVisible();
    await expect(canvas.getByText('$24/mo · Runner memory')).toBeVisible();
    await expect(
      canvas.getByText('Adds capacity for two concurrent repairs.')
    ).toBeVisible();
  },
};
export const Clear: Story = {
  parameters: { bottleneckState: 'clear' },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByText('No current bottleneck')
    ).toBeVisible();
  },
};
export const Missing: Story = {
  parameters: { bottleneckState: 'missing' },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).queryByLabelText('Pipeline Bottleneck')
    ).not.toBeInTheDocument();
  },
};
export const Stale: Story = {
  parameters: { bottleneckState: 'stale' },
  play: Missing.play,
};
export const NonAdmin: Story = { args: { isAdmin: false }, play: Missing.play };

export const StateTransitions: Story = {
  play: async ({ canvasElement, loaded }) => {
    const canvas = within(canvasElement);
    const client = loaded.bottleneckClient as QueryClient;
    const slot = canvas.getByTestId('banner-slot');
    const initial = slot.getBoundingClientRect();
    const loop = contributionFixture();
    const active = bottleneckFixture();
    const needsYou = bottleneckFixture({
      status: 'needs-you',
      cost: loop.cost!,
      impact: loop.impact!,
    });
    for (const data of [
      needsYou,
      { ...active, status: 'clear' as const, rank1: null },
      null,
      active,
    ]) {
      client.setQueryData(queryKeys.hud.pipelineBottleneck(), data);
      await waitFor(() => {
        if (!data) {
          expect(
            canvas.queryByLabelText('Pipeline Bottleneck')
          ).not.toBeInTheDocument();
          expect(
            canvas.queryByText('No current bottleneck')
          ).not.toBeInTheDocument();
        } else {
          expect(
            canvas.getByText(
              data.status === 'clear'
                ? 'No current bottleneck'
                : data.status === 'needs-you'
                  ? 'Needs you'
                  : 'Agentic'
            )
          ).toBeVisible();
        }
      });
      const next = slot.getBoundingClientRect();
      await expect({
        x: next.x,
        y: next.y,
        width: next.width,
        height: next.height,
      }).toEqual({
        x: initial.x,
        y: initial.y,
        width: initial.width,
        height: initial.height,
      });
    }
  },
};
