import '@/app/globals.css';
import '@/styles/system-b-app.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import type { HomeLoopAsk } from '@/lib/home-loop/contract';
import { HOME_LOOP_FIXTURE_ASKS } from './fixtures';
import { HomeLoopAsks, HomeLoopAsksSkeleton } from './HomeLoopAsks';

const reviewAsk: HomeLoopAsk = {
  id: 'review-1',
  title: 'Marketing hero',
  recommendation: 'Review the evidence and certify or request changes.',
  why: 'Marketing hero',
  decidable: true,
  actionLabel: 'Certify',
  canReply: true,
  evidence: [],
  requiresEvidence: true,
  evidenceSummary: null,
  decisionDefault: null,
  canFeedback: false,
};

/** Ask-list states that the base stories do not name. */
const meta = {
  title: 'Organisms/HomeLoop/HomeLoopAsks/States',
  component: HomeLoopAsks,
  parameters: { layout: 'padded' },
  decorators: [
    Story => (
      <div className='w-full max-w-xl bg-base p-4'>
        <Story />
      </div>
    ),
  ],
  args: {
    asks: HOME_LOOP_FIXTURE_ASKS,
    answers: {},
    onApprove: fn(),
    onReply: fn(),
  },
} satisfies Meta<typeof HomeLoopAsks>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Loading: the placeholder cards shown while asks are fetched. */
export const LoadingSkeleton: Story = {
  render: () => <HomeLoopAsksSkeleton />,
};

/** Empty: no asks to decide. */
export const EmptyNoAsks: Story = { args: { asks: [] } };

/** Error: a recorded answer failed and the controls come back. */
export const ErrorAnswerFailed: Story = {
  args: {
    asks: [reviewAsk],
    answers: {
      'review-1': { label: 'Not recorded. Try again.', state: 'failed' },
    },
  },
};

/** Partial: a review ask with no evidence attached, so Certify is disabled. */
export const PartialEvidenceMissing: Story = { args: { asks: [reviewAsk] } };

/** Long content: a title and recommendation past the two-line clamp. */
export const LongContentTitle: Story = {
  args: {
    asks: [
      {
        ...reviewAsk,
        title:
          'Approve the very long named release certification batch for every marketing component across the whole site',
        recommendation:
          'Review all of the attached evidence, compare it against the last certified batch, and then certify the whole group or request changes with a note for the owner.',
        evidence: ['https://example.com/a'],
      },
    ],
  },
};
