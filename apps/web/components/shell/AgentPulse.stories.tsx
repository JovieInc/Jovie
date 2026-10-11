import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { AgentPulse } from './AgentPulse';

const meta = {
  title: 'Shell/AgentPulse',
  component: AgentPulse,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <span className='relative inline-flex h-8 w-8 items-center justify-center rounded bg-surface-1 text-secondary-token'>
        A
        <Story />
      </span>
    ),
  ],
} satisfies Meta<typeof AgentPulse>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const SlowerPulse: Story = {
  args: {
    durationMs: 3200,
  },
};
