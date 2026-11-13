import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, within } from 'storybook/test';
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
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByText(args.assigneeType === 'human' ? 'Me' : 'Jovie')
    ).toBeVisible();
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

export const RtlHuman: Story = {
  decorators: [
    Story => (
      <div dir='rtl'>
        <Story />
      </div>
    ),
  ],
};

export const RtlAiWorkflow: Story = {
  args: { assigneeType: 'ai_workflow' },
  decorators: RtlHuman.decorators,
};
