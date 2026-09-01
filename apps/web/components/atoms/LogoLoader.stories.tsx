import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { LogoLoader } from './LogoLoader';

const meta = {
  title: 'Atoms/LogoLoader',
  component: LogoLoader,
  parameters: {
    layout: 'centered',
  },
  args: {
    size: 32,
    'aria-label': 'Loading',
  },
} satisfies Meta<typeof LogoLoader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Compact: Story = {
  args: {
    size: 20,
    className: 'p-1',
    'aria-label': 'Loading navigation',
  },
};

export const Large: Story = {
  args: {
    size: 48,
  },
};

export const CustomLabel: Story = {
  args: {
    'aria-label': 'Preparing workspace',
  },
};
