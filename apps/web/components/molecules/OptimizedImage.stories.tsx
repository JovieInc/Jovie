import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { OptimizedImage } from './OptimizedImage';

const meta: Meta<typeof OptimizedImage> = {
  title: 'Molecules/OptimizedImage',
  component: OptimizedImage,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
  },
  argTypes: {
    size: {
      control: 'radio',
      options: ['sm', 'md', 'lg', 'xl', '2xl'],
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    src: 'https://images.unsplash.com/photo-1507842217343-583bb7270b66?auto=format&fit=crop&w=400&q=80',
    alt: 'Artist performing',
    size: 'lg',
    shape: 'circle',
    artistName: 'Jovie Artist',
    imageType: 'profile',
  },
};

export const Fallback: Story = {
  args: {
    src: '',
    alt: 'Fallback avatar',
    size: 'md',
    shape: 'rounded',
  },
};
