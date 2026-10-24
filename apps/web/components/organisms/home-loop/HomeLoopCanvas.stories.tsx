import '@/app/globals.css';
import '@/styles/system-b-app.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import {
  HOME_LOOP_FIXTURE_ASKS,
  HOME_LOOP_FIXTURE_BUSY_ASKS,
  HOME_LOOP_FIXTURE_BUSY_DONE,
  HOME_LOOP_FIXTURE_BUSY_ROWS,
  HOME_LOOP_FIXTURE_COPY,
  HOME_LOOP_FIXTURE_DONE,
  HOME_LOOP_FIXTURE_PULSE,
  HOME_LOOP_FIXTURE_ROWS,
  HOME_LOOP_FIXTURE_STAGES,
  HOME_LOOP_FIXTURE_STRIP,
  HOME_LOOP_FIXTURE_UNMEASURED_PULSE,
} from './fixtures';
import { HomeLoopAnswerPanel } from './HomeLoopAnswerPanel';
import { HomeLoopCanvas } from './HomeLoopCanvas';

const meta = {
  title: 'Organisms/HomeLoop/HomeLoopCanvas',
  component: HomeLoopCanvas,
  parameters: { layout: 'padded' },
  args: {
    copy: HOME_LOOP_FIXTURE_COPY,
    stages: HOME_LOOP_FIXTURE_STAGES,
    constraint: {
      tone: 'bad',
      text: 'About 500 issues show In Progress with no live owner, so 0 of 28 Todo issues are eligible',
    },
    pulse: HOME_LOOP_FIXTURE_PULSE,
    asks: HOME_LOOP_FIXTURE_ASKS,
    rows: HOME_LOOP_FIXTURE_ROWS,
    done: HOME_LOOP_FIXTURE_DONE,
    doneSummary: '12 merges',
    loopStatus: 'ready',
    asksStatus: 'ready',
    answers: {},
    onApprove: fn(),
    onReply: fn(),
    onRetryLoop: fn(),
    onRetryAsks: fn(),
  },
} satisfies Meta<typeof HomeLoopCanvas>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Populated: Story = {};

export const Loading: Story = {
  args: { loopStatus: 'loading', asksStatus: 'loading', pulse: [] },
};

export const Empty: Story = {
  args: {
    constraint: null,
    asks: [],
    rows: [],
    done: [],
    doneSummary: null,
  },
};

export const ErrorState: Story = {
  args: { loopStatus: 'error', asksStatus: 'error', pulse: [] },
};

export const NotMeasured: Story = {
  args: {
    constraint: null,
    pulse: HOME_LOOP_FIXTURE_UNMEASURED_PULSE,
    doneSummary: null,
  },
};

export const AnsweredWithUndoWindow: Story = {
  args: {
    answers: {
      'vercel-concurrency': { label: 'Approved', state: 'pending' },
      'lyb-review': { label: 'Not recorded. Try again.', state: 'failed' },
    },
  },
};

export const WithGeneratedAnswer: Story = {
  args: {
    answer: (
      <HomeLoopAnswerPanel
        prompt='Why is the merge queue slow today?'
        reply='Three PRs were ejected for flaky Playwright checks; the queue drained once they were requeued. Median wait is back to 11 minutes.'
        pending={false}
        position={2}
        total={2}
        onBack={fn()}
        onForward={fn()}
        onHome={fn()}
        onOpenTranscript={fn()}
      />
    ),
  },
};

export const GeneratingAnswer: Story = {
  args: {
    answer: (
      <HomeLoopAnswerPanel
        prompt='Summarize revenue this week'
        reply=''
        pending
        position={1}
        total={1}
        onBack={fn()}
        onForward={fn()}
        onHome={fn()}
        onOpenTranscript={fn()}
      />
    ),
  },
};

/**
 * The canvas inside a full-height frame, as Ovie Home renders it: a busy
 * day at any viewport fits with "+N more" and never scrolls.
 */
export const FullScreenBusy: Story = {
  parameters: { layout: 'fullscreen' },
  decorators: [
    Story => (
      <div className='flex h-dvh flex-col bg-base p-4'>
        <Story />
      </div>
    ),
  ],
  args: {
    rows: HOME_LOOP_FIXTURE_BUSY_ROWS,
    done: HOME_LOOP_FIXTURE_BUSY_DONE,
    asks: HOME_LOOP_FIXTURE_BUSY_ASKS,
    strip: HOME_LOOP_FIXTURE_STRIP,
    stripCoverage: '14 of 31 stages measured',
    asksMoreHref: '/app/ov/inbox',
    inFlightMoreHref: '/app/ov/shipping',
  },
};
