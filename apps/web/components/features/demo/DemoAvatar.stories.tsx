import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { DemoAvatar } from './DemoAvatar';

const meta = {
  title: 'Features/Demo/DemoAvatar',
  component: DemoAvatar,
  parameters: {
    layout: 'centered',
  },
  args: {
    assignee: {
      id: 'assignee-1',
      name: 'Tim White',
      initials: 'TW',
      color: '#7170ff',
    },
  },
} satisfies Meta<typeof DemoAvatar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Large: Story = {
  args: {
    size: 36,
  },
};
