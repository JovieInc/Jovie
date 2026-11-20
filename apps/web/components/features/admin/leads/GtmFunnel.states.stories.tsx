import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { type ReactNode, use } from 'react';
import {
  GtmFunnel as GtmFunnelAsync,
  GtmFunnelSkeleton,
  type LeadFunnelCounts,
} from './GtmFunnel';

/**
 * GtmFunnel is an async server component. Each story keeps its promise
 * outside render: React discards hook state while a first mount suspends, so
 * a promise created in render would be new on every retry. The lead report
 * comes from the Storybook mock of the leads reporting module.
 */
function funnelStory(counts: LeadFunnelCounts, dir: 'ltr' | 'rtl' = 'ltr') {
  let funnel: Promise<ReactNode> | null = null;
  return function GtmFunnelStory() {
    funnel ??= GtmFunnelAsync({ counts });
    return (
      <div dir={dir} className='w-full max-w-2xl'>
        {use(funnel)}
      </div>
    );
  };
}

const meta = {
  title: 'Features/Admin/Leads/GtmFunnel States',
  component: GtmFunnelSkeleton,
  parameters: {
    layout: 'centered',
    jovie: { uncoveredProps: ['counts'] },
  },
} satisfies Meta<typeof GtmFunnelSkeleton>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: no lead in any status, so the pipeline has not run yet. */
export const EmptyPipelineNotRun: Story = {
  render: funnelStory({
    discovered: 0,
    qualified: 0,
    disqualified: 0,
    approved: 0,
    ingested: 0,
    rejected: 0,
  }),
};

/** Partial: only discovery has run; no drop-off or later stage yet. */
export const PartialDiscoveredOnly: Story = {
  render: funnelStory({ discovered: 12 }),
};

const largeCounts: LeadFunnelCounts = {
  discovered: 1_482_133,
  qualified: 388_204,
  disqualified: 3_610_877,
  approved: 120_448,
  ingested: 96_212,
  rejected: 14_009,
};

/** Long content: seven-figure counts wrap the stages and drop-offs. */
export const LongContentLargeCounts: Story = {
  render: funnelStory(largeCounts),
};

/** RTL: the stage flow mirrors in a right-to-left container. */
export const RtlStageFlow: Story = {
  render: funnelStory(
    {
      discovered: 145,
      qualified: 38,
      disqualified: 361,
      approved: 0,
      ingested: 6,
      rejected: 1,
    },
    'rtl'
  ),
};
