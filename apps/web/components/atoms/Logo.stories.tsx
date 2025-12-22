import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Logo } from './Logo';

const meta: Meta<typeof Logo> = {
  title: 'Atoms/Logo',
  component: Logo,
  tags: ['autodocs'],
  argTypes: {
    size: {
      control: 'radio',
      options: ['xs', 'sm', 'md', 'lg', 'xl'],
    },
  },
  parameters: {
    layout: 'centered',
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const ExtraLarge: Story = {
  args: {
    size: 'xl',
  },
};
