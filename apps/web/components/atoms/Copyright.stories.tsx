import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Copyright } from './Copyright';

const meta: Meta<typeof Copyright> = {
  title: 'Atoms/Copyright',
  component: Copyright,
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: { type: 'radio' },
      options: ['light', 'dark'],
    },
    year: { control: { type: 'number' } },
  },
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    year: new Date().getFullYear(),
  },
};

export const Light: Story = {
  args: {
    variant: 'light',
    year: 2025,
  },
};
