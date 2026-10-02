import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { AiDemo } from './AiDemo';

const meta = {
  title: 'Features/Home/AiDemo',
  component: AiDemo,
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof AiDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    variant: 'default',
  },
};

export const Premium: Story = {
  args: {
    variant: 'premium',
    contextChips: ['Tim White', 'The Sound', '1.2M streams'],
  },
};
