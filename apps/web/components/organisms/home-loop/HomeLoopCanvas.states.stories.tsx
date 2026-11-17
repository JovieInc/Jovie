import '@/app/globals.css';
import type { ReactNode } from 'react';
import '@/styles/system-b-app.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn, within } from 'storybook/test';
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
} from './fixtures';
import { HomeLoopCanvas } from './HomeLoopCanvas';

function Frame(Story: () => ReactNode) {
  return (
    <div className='flex h-dvh flex-col bg-base p-4'>
      <Story />
    </div>
  );
}

function RtlFrame(Story: () => ReactNode) {
  return (
    <div dir='rtl'>
      <Story />
    </div>
  );
}

/**
 * State coverage for the Home loop canvas. The canonical stories stay in
 * HomeLoopCanvas.stories.tsx; these use the same fixture args and change only
 * which reads succeeded, how much data arrives and the document direction.
 */
const meta = {
  title: 'Organisms/HomeLoop/HomeLoopCanvas States',
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

/**
 * Partial: the asks read succeeded with a source warning while the shipping
 * read failed, so asks render beside retryable in-flight and done errors.
 */
export const PartialShippingReadFailed: Story = {
  args: {
    loopStatus: 'error',
    pulse: [],
    asksNotice: '3 sources are unavailable or missing evidence.',
    asksNoticeHref: '/app/ov/inbox',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByTestId('home-loop-asks-section-notice')
    ).toBeVisible();
    await expect(canvas.getAllByRole('alert').length).toBeGreaterThan(0);
  },
};

/** Long content: a busy day with a long constraint; every list ends in "+N more". */
export const LongContentBusyDay: Story = {
  parameters: { layout: 'fullscreen' },
  decorators: [Frame],
  args: {
    constraint: {
      tone: 'bad',
      text: 'About 500 issues show In Progress with no live owner, so 0 of 28 Todo issues are eligible for pickup, the merge queue is ejecting flaky Playwright checks and production is six days behind main',
      detailsHref: '/app/ov/product',
    },
    rows: HOME_LOOP_FIXTURE_BUSY_ROWS,
    done: HOME_LOOP_FIXTURE_BUSY_DONE,
    asks: HOME_LOOP_FIXTURE_BUSY_ASKS,
    strip: HOME_LOOP_FIXTURE_STRIP,
    stripCoverage: '14 of 31 stages measured',
    asksMoreHref: '/app/ov/inbox',
    inFlightMoreHref: '/app/ov/shipping',
  },
};

/** Right-to-left: the populated canvas inside an RTL document. */
export const RtlDocument: Story = {
  args: {
    constraint: { tone: 'warn', text: 'قائمة الدمج متوقفة منذ ساعتين' },
  },
  decorators: [RtlFrame],
};
