import type { Meta, StoryObj } from '@storybook/react';
import { FrostedButton } from '@/components/atoms/FrostedButton';

const meta: Meta<typeof FrostedButton> = {
  title: 'UI/FrostedButton',
  component: FrostedButton,
  args: {
    children: 'Frosted CTA',
  },
};

export default meta;

type Story = StoryObj<typeof FrostedButton>;

export const Solid: Story = {
  args: {
    tone: 'solid',
  },
};

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

export const AsLink: Story = {
  args: {
    tone: 'ghost',
    href: '/signup',
  },
};
