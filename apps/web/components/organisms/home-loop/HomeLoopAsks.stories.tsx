import '@/app/globals.css';
import '@/styles/system-b-app.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { HOME_LOOP_FIXTURE_ASKS } from './fixtures';
import { HomeLoopAsks } from './HomeLoopAsks';

const meta = {
  title: 'Organisms/HomeLoop/HomeLoopAsks',
  component: HomeLoopAsks,
  parameters: { layout: 'padded' },
  // Home is a dark-surface view; the "+N more" overflow line renders directly
  // on the canvas, so give the story the dark base for the intended contrast
  // context (axe color-contrast).
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

export const Open: Story = {};

export const Answered: Story = {
  args: {
    answers: {
      'vercel-concurrency': { label: 'Approved', state: 'pending' },
      'lyb-review': { label: 'Not recorded. Try again.', state: 'failed' },
    },
  },
};

export const OverflowLinksToInbox: Story = {
  args: {
    asks: [
      ...HOME_LOOP_FIXTURE_ASKS,
      ...HOME_LOOP_FIXTURE_ASKS.map(ask => ({ ...ask, id: `${ask.id}-2` })),
    ],
    moreHref: '/app/ov/inbox',
  },
};

export const WithAskerOptions: Story = {
  args: {
    asks: HOME_LOOP_FIXTURE_ASKS.map((ask, index) =>
      index === 0
        ? { ...ask, options: ['Signed in', 'Restarted it myself'] }
        : ask
    ),
  },
};

/** No-default decisions that waited past 24h and 48h rise to the top. */
export const Escalated: Story = {
  args: {
    asks: HOME_LOOP_FIXTURE_ASKS.map((ask, index) => ({
      ...ask,
      escalation:
        index === 0
          ? { level: 2 as const, waitingHours: 52 }
          : { level: 1 as const, waitingHours: 26 },
    })),
  },
};

/** Review asks: one with attached evidence, one with none (action disabled). */
export const ReviewEvidence: Story = {
  args: {
    asks: HOME_LOOP_FIXTURE_ASKS.slice(0, 2).map((ask, index) => ({
      ...ask,
      actionLabel: 'Certify',
      requiresEvidence: true,
      evidence: index === 0 ? ['https://example.com/receipt'] : [],
      evidenceSummary: index === 0 ? 'unit pass · visual pass' : null,
    })),
  },
};

/** An explicit disclosure must preserve its triggering card and controls. */
export const FittedReviewDisclosure: Story = {
  args: {
    fit: true,
    moreHref: '/app/ov/inbox',
    asks: [
      {
        ...HOME_LOOP_FIXTURE_ASKS[0],
        id: 'fixture-review-disclosure',
        why: Array.from(
          { length: 18 },
          (_, index) =>
            `Evidence detail ${index + 1}: inspect the recorded outcome before deciding.`
        ).join('\n'),
      },
    ],
  },
  decorators: [
    Story => (
      <div
        data-testid='home-loop-fit-viewport'
        style={{
          height: 360,
          width: 390,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <Story />
      </div>
    ),
  ],
  parameters: { layout: 'fullscreen' },
  play: async ({ canvasElement, step }) => {
    const canvas = within(canvasElement);
    await step('Retain active controls while reading Why', async () => {
      const why = canvas.getByRole('button', { name: 'Why' });
      const card = canvas.getByTestId('home-loop-ask');
      const before = card.getBoundingClientRect();
      await userEvent.click(why);
      // Wait through layout and ResizeObserver delivery before asserting access.
      await new Promise<void>(resolve =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      );
      await expect(why).toBeVisible();
      await expect(card).not.toHaveAttribute('aria-hidden', 'true');
      await expect(card.getBoundingClientRect().height).toBe(before.height);
      const dialog = within(canvasElement.ownerDocument.body).getByRole(
        'dialog',
        { name: `Why: ${HOME_LOOP_FIXTURE_ASKS[0]?.title}` }
      );
      await expect(dialog).toBeVisible();
      const bounds = dialog.getBoundingClientRect();
      await expect(bounds.left).toBeGreaterThanOrEqual(0);
      await expect(bounds.right).toBeLessThanOrEqual(window.innerWidth);
      await userEvent.keyboard('{Escape}');
      await waitFor(() => expect(why).toHaveFocus());
      await expect(why).toHaveAttribute('aria-expanded', 'false');
    });
    await step(
      'Close Why and preserve focus when resizing hides its card',
      async () => {
        const why = canvas.getByRole('button', { name: 'Why' });
        const viewport = canvas.getByTestId('home-loop-fit-viewport');
        const body = within(canvasElement.ownerDocument.body);
        await userEvent.click(why);
        await expect(body.getByRole('dialog')).toBeVisible();
        viewport.style.height = '72px';
        try {
          await waitFor(() =>
            expect(canvas.getByTestId('home-loop-ask')).toHaveAttribute(
              'aria-hidden',
              'true'
            )
          );
          await waitFor(() =>
            expect(body.queryByRole('dialog')).not.toBeInTheDocument()
          );
          await waitFor(() =>
            expect(
              canvas.getByRole('link', { name: '+1 more decision' })
            ).toHaveFocus()
          );
        } finally {
          viewport.style.height = '360px';
        }
      }
    );
  },
};
