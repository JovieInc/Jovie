import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { OpportunityInboxReportCard } from './OpportunityInboxReportCard';

const meta: Meta<typeof OpportunityInboxReportCard> = {
  title: 'Features/OpportunityInbox/OpportunityInboxReportCard',
  component: OpportunityInboxReportCard,
  parameters: {
    layout: 'centered',
  },
};

export default meta;
type Story = StoryObj<typeof OpportunityInboxReportCard>;

export const PositiveLift: Story = {
  args: {
    card: {
      id: 'story-report-1',
      typeLabel: 'Report',
      createdAt: '2026-07-04T10:00:00.000Z',
      title: 'Thumbnail experiment finished',
      why: 'Challenger A beat your baseline over the 14-day window. Watch-minutes per impression drove the call.',
      primaryActionLabel: 'Run on 3 more videos',
      status: 'pending',
      category: 'report',
      report: {
        metricLabel: 'views',
        deltaPercent: 5.4,
        deltaDisplay: '+5.4%',
        direction: 'up',
        series: [120, 132, 128, 150, 148, 163, 171],
        items: [
          { label: 'Challenger A', deltaPercent: 5.4, detail: 'promoted' },
          { label: 'Challenger B', deltaPercent: 1.2 },
          { label: 'Baseline', deltaPercent: 0 },
        ],
        experimentId: 'exp-42',
        nextStep: {
          label: 'Run on 3 more videos',
          kind: 'experiment.start',
          payload: { videoCount: 3 },
        },
      },
    },
    onNextStep: () => undefined,
    onDismiss: () => undefined,
    className: 'w-[42rem] max-w-full',
  },
};

export const NegativeResult: Story = {
  args: {
    ...PositiveLift.args,
    card: {
      id: 'story-report-2',
      typeLabel: 'Report',
      createdAt: '2026-07-03T10:00:00.000Z',
      title: 'Smart link CTA experiment finished',
      why: 'The variant underperformed — Jovie reverted to your baseline automatically.',
      primaryActionLabel: 'Try a new variant',
      status: 'pending',
      category: 'report',
      report: {
        metricLabel: 'link clicks',
        deltaPercent: -2.1,
        deltaDisplay: '−2.1%',
        direction: 'down',
        series: [88, 84, 90, 81, 79, 82],
        items: [{ label: 'Variant', deltaPercent: -2.1 }],
        experimentId: 'exp-43',
        nextStep: {
          label: 'Try a new variant',
          kind: 'experiment.start',
        },
      },
    },
  },
};
