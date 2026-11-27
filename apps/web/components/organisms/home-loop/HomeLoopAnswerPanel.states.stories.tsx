import '@/app/globals.css';
import type { ReactNode } from 'react';
import '@/styles/system-b-app.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn, within } from 'storybook/test';
import { HomeLoopAnswerPanel } from './HomeLoopAnswerPanel';

function RtlFrame(Story: () => ReactNode) {
  return (
    <div dir='rtl'>
      <Story />
    </div>
  );
}

/**
 * State coverage for the generated answer panel. The canonical stories stay in
 * HomeLoopAnswerPanel.stories.tsx; these use the same args and change only the
 * reply, its pending flag, the copy length and the document direction.
 */
const meta = {
  title: 'Organisms/HomeLoop/HomeLoopAnswerPanel States',
  component: HomeLoopAnswerPanel,
  parameters: { layout: 'padded' },
  args: {
    prompt: 'Why is the merge queue slow today?',
    reply:
      'Three PRs were ejected for flaky Playwright checks; the queue drained once they were requeued.',
    pending: false,
    position: 2,
    total: 3,
    onBack: fn(),
    onForward: fn(),
    onHome: fn(),
    onOpenTranscript: fn(),
  },
} satisfies Meta<typeof HomeLoopAnswerPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Loading: the reply is still streaming, so skeleton lines hold its place. */
export const LoadingReply: Story = {
  args: { reply: '', pending: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId('home-loop-answer-pending')).toBeVisible();
  },
};

/** Empty: a finished turn with no reply text keeps the header and controls only. */
export const EmptyReply: Story = {
  args: { reply: '', pending: false },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole('button', { name: 'Back To Home' })
    ).toBeVisible();
  },
};

/**
 * Partial: Story First flat surface — answer without card chrome while the
 * board melts. Optional `surface` + `children` make this a reachable state.
 */
export const PartialFlatSurface: Story = {
  args: {
    surface: 'flat',
    prompt: 'Why is checkout blocking revenue?',
    reply:
      'Entitlement after payment is uncertified — the same words Summer will say in chat.',
    position: 1,
    total: 1,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId('home-loop-answer')).toHaveAttribute(
      'data-surface',
      'flat'
    );
  },
};

/** Long content: a long prompt truncates and a long reply clamps to four lines. */
export const LongContentReply: Story = {
  args: {
    prompt:
      'Why is the merge queue slow today, and which of the checks that ejected pull requests were flaky rather than real failures?',
    reply: Array.from(
      { length: 8 },
      (_, i) =>
        `Line ${i + 1}: the queue ejected another pull request after a flaky Playwright check and requeued it once the retry passed.`
    ).join('\n'),
    position: 12,
    total: 12,
  },
};

/** Right-to-left: an Arabic prompt and reply inside an RTL document. */
export const RtlDocument: Story = {
  args: {
    prompt: 'لماذا قائمة الدمج بطيئة اليوم؟',
    reply: 'تم إخراج ثلاثة طلبات بسبب فحوصات غير مستقرة ثم أعيدت إلى القائمة.',
  },
  decorators: [RtlFrame],
};
