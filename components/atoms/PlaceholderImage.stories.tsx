import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { PlaceholderImage } from './PlaceholderImage';

const meta: Meta<typeof PlaceholderImage> = {
  title: 'Atoms/PlaceholderImage',
  component: PlaceholderImage,
  tags: ['autodocs'],
  argTypes: {
    size: {
      control: 'radio',
      options: ['sm', 'md', 'lg', 'xl', '2xl'],
    },
    shape: {
      control: 'radio',
      options: ['circle', 'square', 'rounded'],
    },
  },
  parameters: {
    layout: 'centered',
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    size: 'md',
    shape: 'circle',
  },
};

export const WideRounded: Story = {
  args: {
    size: '2xl',
    shape: 'rounded',
  },
};
