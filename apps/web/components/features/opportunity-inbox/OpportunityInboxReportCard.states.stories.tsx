import '@/styles/system-b-app.css';
import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import type { OpportunityInboxCardViewModel } from '@/lib/connectors/opportunity-inbox-types';
import { OpportunityInboxReportCard } from './OpportunityInboxReportCard';

type Report = NonNullable<OpportunityInboxCardViewModel['report']>;

const baseReport: Report = {
  metricLabel: 'Saves per visitor',
  deltaPercent: 18,
  deltaDisplay: '+18%',
  direction: 'up',
  polarity: 'higher-is-better',
  sentiment: 'positive',
  series: [4, 5, 5, 6, 7, 8, 9],
  items: [
    { label: 'Mobile', deltaPercent: 22, detail: '1,204 visitors' },
    { label: 'Desktop', deltaPercent: 9, detail: '318 visitors' },
  ],
  experimentId: 'exp-cta-swap-1',
  nextStep: { label: 'Roll out to all releases', kind: 'apply_experiment' },
};

const baseCard: OpportunityInboxCardViewModel = {
  id: 'report-states-1',
  signalType: 'other',
  typeLabel: 'Experiment result',
  createdAt: '2026-07-04T10:00:00.000Z',
  title: 'Release-day CTA swap lifted saves',
  why: 'The Listen Now call to action outperformed Save For Later.',
  primaryActionLabel: 'Review',
  status: 'pending',
  category: 'report',
  report: baseReport,
};

const withReport = (
  patch: Partial<Report>,
  card: Partial<OpportunityInboxCardViewModel> = {}
): OpportunityInboxCardViewModel => ({
  ...baseCard,
  ...card,
  report: { ...baseReport, ...patch },
});

/** Rendered states of the experiment report card. */
const meta = {
  title: 'Dashboard/Opportunity Inbox/Report Card/States',
  component: OpportunityInboxReportCard,
  parameters: { layout: 'padded' },
  args: { card: baseCard, onNextStep: () => {}, onDismiss: () => {} },
} satisfies Meta<typeof OpportunityInboxReportCard>;

export default meta;
type Story = StoryObj<typeof meta>;

const withCardWidth: Decorator = function WithCardWidth(Story) {
  return (
    <div className='w-full max-w-xl'>
      <Story />
    </div>
  );
};

const withRtlDocument: Decorator = function WithRtlDocument(Story) {
  return (
    <div dir='rtl' lang='ar' className='w-full max-w-xl'>
      <Story />
    </div>
  );
};

/** Loading: the next step is being submitted, so every action is disabled. */
export const LoadingSubmittingNextStep: Story = {
  args: { isSubmittingNextStep: true },
  decorators: [withCardWidth],
};

/** Empty: a result with no per-item breakdown to expand. */
export const EmptyBreakdown: Story = {
  args: { card: withReport({ items: [] }) },
  decorators: [withCardWidth],
};

/** Partial: no trend series and no next step. */
export const PartialNoSeriesOrNextStep: Story = {
  args: { card: withReport({ series: [], nextStep: undefined }) },
  decorators: [withCardWidth],
};

/** Long content: a title and metric label past one line. */
export const LongContentTitleAndMetric: Story = {
  args: {
    card: withReport(
      {
        metricLabel:
          'Saves per unique visitor across every release page and smart link in the first seven days',
      },
      {
        title:
          'The release-day call to action swap on the pre-save page and every smart link lifted saves across mobile and desktop visitors',
      }
    ),
  },
  decorators: [withCardWidth],
};

/** Right-to-left: Arabic copy in an Arabic document. */
export const RtlArabicCopy: Story = {
  args: {
    card: withReport(
      { metricLabel: 'عمليات الحفظ لكل زائر' },
      { title: 'تغيير زر الإجراء يوم الإصدار رفع عمليات الحفظ' }
    ),
  },
  decorators: [withRtlDocument],
};
