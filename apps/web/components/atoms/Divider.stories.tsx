import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Divider } from './Divider';

const meta: Meta<typeof Divider> = {
  title: 'Atoms/Divider',
  component: Divider,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Horizontal: Story = {};

export const Vertical: Story = {
  args: {
    orientation: 'vertical',
    className: 'h-24',
  },
};

export const Inset: Story = {
  args: {
    inset: true,
  },
};
