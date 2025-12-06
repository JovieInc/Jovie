import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { VerifiedBadge } from './VerifiedBadge';

const meta: Meta<typeof VerifiedBadge> = {
  title: 'Atoms/VerifiedBadge',
  component: VerifiedBadge,
  tags: ['autodocs'],
  argTypes: {
    size: {
      control: 'radio',
      options: ['sm', 'md', 'lg'],
    },
  },
  parameters: {
    layout: 'centered',
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Large: Story = {
  args: {
    size: 'lg',
  },
};
