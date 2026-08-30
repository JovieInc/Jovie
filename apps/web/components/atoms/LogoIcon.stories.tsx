import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { LogoIcon } from './LogoIcon';

const meta = {
  title: 'Atoms/LogoIcon',
  component: LogoIcon,
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof LogoIcon>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Color: Story = {
  args: {
    size: 48,
    variant: 'color',
  },
};

export const White: Story = {
  args: {
    size: 40,
    variant: 'white',
    className: 'rounded-lg bg-surface-inverse p-2',
  },
};

export const Muted: Story = {
  args: {
    size: 32,
    variant: 'muted',
  },
};
