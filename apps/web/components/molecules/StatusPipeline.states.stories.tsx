import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { StatusPipeline, type StatusPipelineStage } from './StatusPipeline';

// Synthetic display fixture; not a deployment or usage receipt.
const stage = (
  id: string,
  label: string,
  state: StatusPipelineStage['state'],
  value: string,
  evidence: string
): StatusPipelineStage => ({ id, label, state, value, evidence });

const CanvasFrame: Decorator = function CanvasFrame(Story) {
  return (
    <div className='max-w-md'>
      <Story />
    </div>
  );
};

const RtlFrame: Decorator = function RtlFrame(Story) {
  return (
    <div dir='rtl'>
      <Story />
    </div>
  );
};

const meta = {
  title: 'Molecules/StatusPipeline States',
  component: StatusPipeline,
  parameters: { layout: 'padded' },
  args: {
    ariaLabel: 'Product Delivery Lifecycle',
    stages: [
      stage('desired', 'Desired', 'done', 'Registered', 'Feature registry'),
      stage('built', 'Built', 'current', 'In review', 'Open pull request'),
    ],
  },
} satisfies Meta<typeof StatusPipeline>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Loading: every stage is still pending, waiting for its first reading. */
export const PendingAllStages: Story = {
  args: {
    stages: [
      stage('desired', 'Desired', 'pending', 'Not reached', 'Feature registry'),
      stage('built', 'Built', 'pending', 'Not reached', 'Merge history'),
      stage('deployed', 'Deployed', 'pending', 'Not reached', 'Deploy log'),
      stage('observed', 'Observed', 'pending', 'Not reached', 'Analytics'),
    ],
  },
};

/** Empty: the owner has no stages to show yet. */
export const EmptyNoStages: Story = {
  args: { stages: [] },
};

/** Partial: early stages are evidenced, later ones have no reading. */
export const PartialEvidence: Story = {
  args: {
    stages: [
      stage('desired', 'Desired', 'done', 'Registered', 'Feature registry'),
      stage('built', 'Built', 'done', 'Merged', 'Merge history'),
      stage('deployed', 'Deployed', 'unknown', 'No receipt', 'Deploy log'),
      stage('observed', 'Observed', 'unknown', 'Not instrumented', 'Analytics'),
    ],
  },
};

/** Long content: long labels and readings truncate inside their cells. */
export const LongContentReadings: Story = {
  args: {
    stages: [
      stage(
        'certified',
        'Certified for every supported surface',
        'blocked',
        'Waiting on accessibility and visual review sign-off',
        'Certification checklist for web, iOS and the embeddable widget'
      ),
      stage(
        'deployed',
        'Deployed to production and staging',
        'failed',
        'Rolled back after the canary error budget was spent',
        'Deploy log, production and staging environments'
      ),
    ],
  },
  decorators: [CanvasFrame],
};

/** Right-to-left: Arabic stage labels inside an RTL document. */
export const RtlArabicStages: Story = {
  args: {
    ariaLabel: 'دورة حياة المنتج',
    stages: [
      stage('desired', 'مطلوب', 'done', 'مسجل', 'سجل الميزات'),
      stage('built', 'مبني', 'current', 'قيد المراجعة', 'طلب دمج مفتوح'),
      stage('deployed', 'منشور', 'pending', 'لم يصل', 'سجل النشر'),
    ],
  },
  decorators: [RtlFrame],
};
