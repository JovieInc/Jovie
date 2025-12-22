import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { LogoLoader } from './LogoLoader';

const meta: Meta<typeof LogoLoader> = {
  title: 'Atoms/LogoLoader',
  component: LogoLoader,
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'radio',
      options: ['color', 'mono'],
    },
    size: { control: 'number' },
  },
  parameters: {
    layout: 'centered',
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Color: Story = {};

export const Mono: Story = {
  args: {
    variant: 'mono',
  },
};
