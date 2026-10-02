import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { CopyToggleIcon } from './CopyToggleIcon';

const meta = {
  title: 'Atoms/CopyToggleIcon',
  component: CopyToggleIcon,
  parameters: {
    layout: 'centered',
  },
  args: {
    copied: false,
  },
} satisfies Meta<typeof CopyToggleIcon>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Idle: Story = {};

export const Copied: Story = {
  args: {
    copied: true,
  },
};

export const Large: Story = {
  args: {
    size: 'h-5 w-5',
  },
};
