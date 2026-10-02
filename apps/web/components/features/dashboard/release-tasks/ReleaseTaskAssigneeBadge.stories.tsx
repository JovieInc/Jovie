import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ReleaseTaskAssigneeBadge } from './ReleaseTaskAssigneeBadge';

const meta = {
  title: 'Dashboard/ReleaseTasks/ReleaseTaskAssigneeBadge',
  component: ReleaseTaskAssigneeBadge,
  parameters: {
    layout: 'centered',
  },
  args: {
    assigneeType: 'human',
  },
  argTypes: {
    assigneeType: {
      control: 'select',
      options: ['human', 'ai_workflow'],
    },
  },
} satisfies Meta<typeof ReleaseTaskAssigneeBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Human: Story = {};

export const AiWorkflow: Story = {
  args: {
    assigneeType: 'ai_workflow',
  },
};
