import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { JovieIcon } from './JovieIcon';

const meta: Meta<typeof JovieIcon> = {
  title: 'Atoms/JovieIcon',
  component: JovieIcon,
  tags: ['autodocs'],
  argTypes: {
    size: { control: 'number' },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    size: 48,
  },
};

export const Small: Story = {
  args: {
    size: 32,
  },
};
