import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { type StudioTake, StudioTakesSheet } from './StudioTakesSheet';

const TAKES: readonly StudioTake[] = [
  {
    id: 'take-1',
    number: 1,
    source: 'script',
    durationMs: 42_000,
    localUrl: '',
    status: 'saved',
    kept: true,
  },
  {
    id: 'take-2',
    number: 2,
    source: 'answer',
    question: 'What were you feeling the night you wrote it?',
    durationMs: 61_000,
    localUrl: '',
    status: 'uploading',
    kept: false,
  },
  {
    id: 'take-3',
    number: 3,
    source: 'script',
    durationMs: 38_000,
    localUrl: '',
    status: 'failed',
    kept: false,
  },
];

const meta = {
  title: 'Features/TeleprompterStudio/StudioTakesSheet',
  component: StudioTakesSheet,
  parameters: { layout: 'centered', themes: { themeOverride: 'dark' } },
  args: {
    title: 'Release day shout-out',
    takes: TAKES,
    onToggleKept: () => {},
    onRetry: () => {},
    onDone: () => {},
  },
} satisfies Meta<typeof StudioTakesSheet>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Mixed: Story = {};
export const Empty: Story = { args: { takes: [] } };
