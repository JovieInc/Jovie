import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { NavLink } from './NavLink';

const meta = {
  title: 'Atoms/NavLink',
  component: NavLink,
  parameters: {
    layout: 'centered',
  },
  args: {
    href: '/pricing',
    children: 'Pricing',
    variant: 'default',
  },
} satisfies Meta<typeof NavLink>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Primary: Story = {
  args: {
    href: '/signup',
    children: 'Get Started',
    variant: 'primary',
  },
};

export const External: Story = {
  args: {
    href: 'https://example.com',
    children: 'Docs',
    external: true,
  },
};
