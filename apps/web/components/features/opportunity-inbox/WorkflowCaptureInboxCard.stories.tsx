import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn, userEvent, within } from 'storybook/test';
import type { OpportunityInboxCardViewModel } from '@/lib/connectors/opportunity-inbox-types';
import { WorkflowCaptureInboxCard } from './WorkflowCaptureInboxCard';

const card: OpportunityInboxCardViewModel = {
  id: 'capture-1',
  signalType: 'other',
  typeLabel: 'Workflow',
  createdAt: '2026-08-28T10:00:00.000Z',
  title: 'Record the YouTube Studio thumbnail flow',
  why: 'Show Jovie how you start a native thumbnail experiment.',
  primaryActionLabel: 'Record',
  status: 'pending',
  category: 'workflow_capture',
  workflowCapture: {
    instructions: 'Stop before publishing.',
    startUrl: 'https://studio.youtube.com',
    expiresAt: '2099-01-01T00:00:00.000Z',
    state: 'pending',
  },
};

const meta = {
  title: 'Features/Opportunity Inbox/Workflow Capture Card',
  component: WorkflowCaptureInboxCard,
  parameters: { layout: 'fullscreen' },
  decorators: [
    function MetaDecorator(Story) {
      return (
        <div className='mx-auto w-full max-w-3xl bg-surface-page p-6'>
          <Story />
        </div>
      );
    },
  ],
  args: { card, onDismiss: fn(), onComplete: fn() },
} satisfies Meta<typeof WorkflowCaptureInboxCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** A recording already stored and waiting for review before it is sent. */
export const ReviewRecording: Story = {
  args: {
    card: {
      ...card,
      workflowCapture: {
        ...card.workflowCapture!,
        state: 'uploaded_needs_review',
      },
    },
  },
};

/** Empty: a request with no workflow link to open. */
export const EmptyNoStartUrl: Story = {
  args: {
    card: {
      ...card,
      workflowCapture: { ...card.workflowCapture!, startUrl: null },
    },
  },
};

/** Error: Storybook cannot record the screen, so Record reports the failure. */
export const ErrorRecordingUnavailable: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole('button', { name: 'Record' })
    );
  },
};

/** Long content: a long title and rationale. */
export const LongContent: Story = {
  args: {
    card: {
      ...card,
      title:
        'Record the YouTube Studio thumbnail experiment flow from the channel dashboard through the test and compare setup',
      why: 'Show Jovie exactly how you open the video, start a native thumbnail experiment with the candidate image, and stop before anything is published to the channel.',
    },
  },
};

/** Rtl: an Arabic request in a right-to-left document. */
export const Rtl: Story = {
  args: {
    card: {
      ...card,
      title: 'سجّل خطوات الصورة المصغرة في يوتيوب ستوديو',
      why: 'أرِ جوفي كيف تبدأ تجربة الصورة المصغرة.',
    },
  },
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
