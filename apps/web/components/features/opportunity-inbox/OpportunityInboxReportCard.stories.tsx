import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { OpportunityInboxCardViewModel } from '@/lib/connectors/opportunity-inbox-types';
import { OpportunityInboxReportCard } from './OpportunityInboxReportCard';

const card: OpportunityInboxCardViewModel = {
  id: 'card-1',
  signalType: 'other',
  typeLabel: 'Experiment result',
  createdAt: new Date().toISOString(),
  title: 'Release-day CTA swap lifted saves',
  why: 'The "Listen now" primary CTA outperformed "Save for later" on release day.',
  primaryActionLabel: 'Review',
  status: 'pending',
  category: 'report',
  report: {
    metricLabel: 'Saves per visitor',
    deltaPercent: 18,
    deltaDisplay: '+18%',
    direction: 'up',
    series: [4, 5, 5, 6, 7, 8, 9],
    items: [
      { label: 'Mobile', deltaPercent: 22, detail: '1,204 visitors' },
      { label: 'Desktop', deltaPercent: 9, detail: '318 visitors' },
    ],
    experimentId: 'exp-cta-swap-1',
    nextStep: {
      label: 'Roll out to all releases',
      kind: 'apply_experiment',
    },
  },
};

const meta = {
  title: 'Features/OpportunityInbox/OpportunityInboxReportCard',
  component: OpportunityInboxReportCard,
  parameters: {
    layout: 'centered',
  },
  args: {
    card,
    onNextStep: () => {},
    onDismiss: () => {},
  },
} satisfies Meta<typeof OpportunityInboxReportCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Up: Story = {};

export const Down: Story = {
  args: {
    card: {
      ...card,
      report: {
        metricLabel: card.report?.metricLabel ?? '',
        deltaPercent: -6,
        deltaDisplay: '-6%',
        direction: 'down',
        series: card.report?.series ?? [],
        items: card.report?.items ?? [],
        experimentId: card.report?.experimentId ?? null,
        nextStep: null,
      },
    },
  },
};
