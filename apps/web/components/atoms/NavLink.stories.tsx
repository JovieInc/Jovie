import type { Meta, StoryObj } from '@storybook/react';
import { NavLink } from './NavLink';

const meta: Meta<typeof NavLink> = {
  title: 'UI/NavLink',
  component: NavLink,
  args: {
    children: 'Features',
    href: '/features',
  },
};

export default meta;

type Story = StoryObj<typeof NavLink>;

export const Default: Story = {};

export const Primary: Story = {
  args: {
    children: 'Start free trial',
    variant: 'primary',
  },
};

export const External: Story = {
  args: {
    children: 'Open docs',
    href: 'https://jovie.so/docs',
    external: true,
  },
};
