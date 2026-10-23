import '@/app/globals.css';
import '@/styles/system-b-app.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { HomeLoopAnswerPanel } from './HomeLoopAnswerPanel';

const meta = {
  title: 'Organisms/HomeLoop/HomeLoopAnswerPanel',
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

export const Answered: Story = {};
export const Streaming: Story = { args: { reply: '', pending: true } };
export const FirstOfOne: Story = { args: { position: 1, total: 1 } };
