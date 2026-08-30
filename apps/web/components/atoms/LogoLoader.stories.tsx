import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { LogoLoader } from './LogoLoader';

const meta = {
  title: 'Atoms/LogoLoader',
  component: LogoLoader,
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof LogoLoader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Loading: Story = {
  args: {
    size: 32,
    'aria-label': 'Loading profile',
  },
};

export const Compact: Story = {
  args: {
    size: 20,
    className: 'p-1',
    'aria-label': 'Loading navigation',
  },
};
