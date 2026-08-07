import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { FrostedButton } from './FrostedButton';

const meta = {
  title: 'Atoms/FrostedButton',
  component: FrostedButton,
  parameters: {
    layout: 'centered',
  },
  args: {
    children: 'Frosted action',
  },
} satisfies Meta<typeof FrostedButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Solid: Story = {};

export const Ghost: Story = {
  args: {
    tone: 'ghost',
  },
};

export const Outline: Story = {
  args: {
    tone: 'outline',
  },
};

export const Disabled: Story = {
  args: {
    disabled: true,
  },
};
