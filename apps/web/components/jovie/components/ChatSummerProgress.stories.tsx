import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ChatSummerProgress } from './ChatSummerProgress';

const meta = {
  title: 'Jovie/Chat/ChatSummerProgress',
  component: ChatSummerProgress,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof ChatSummerProgress>;

export default meta;
type Story = StoryObj<typeof meta>;

export const CheckingOneSource: Story = {
  args: {
    progress: [
      { kind: 'tool', name: 'shipping_state', phase: 'start', ms: null },
    ],
  },
};

export const FinishedAndChecking: Story = {
  args: {
    progress: [
      { kind: 'tool', name: 'shipping_state', phase: 'start', ms: null },
      { kind: 'tool', name: 'shipping_state', phase: 'done', ms: 420 },
      { kind: 'tool', name: 'spend', phase: 'start', ms: null },
    ],
  },
};

export const PlannerHandoff: Story = {
  args: {
    progress: [
      { kind: 'status', phase: 'planner', text: 'Handing to the planner' },
      { kind: 'plan', summary: 'Plan ready' },
    ],
  },
};

export const ToolFailed: Story = {
  args: {
    progress: [
      { kind: 'tool', name: 'spend', phase: 'start', ms: null },
      { kind: 'tool', name: 'spend', phase: 'error', ms: null },
    ],
  },
};
