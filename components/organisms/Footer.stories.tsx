import type { Meta, StoryObj } from '@storybook/react';
import { Footer } from './Footer';

const meta: Meta<typeof Footer> = {
  title: 'Organisms/Footer',
  component: Footer,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'inline-radio',
      options: ['minimal', 'regular', 'marketing', 'profile'],
    },
  },
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Minimal: Story = {
  name: 'Variant – Minimal',
  args: {
    variant: 'minimal',
    showThemeToggle: true,
    links: [
      { href: '/legal/privacy', label: 'Privacy' },
      { href: '/legal/terms', label: 'Terms' },
    ],
  },
};

export const Regular: Story = {
  name: 'Variant – Regular (Clerk-style)',
  args: {
    variant: 'regular',
    showThemeToggle: true,
    links: [
      { href: '/legal/privacy', label: 'Privacy' },
      { href: '/legal/terms', label: 'Terms' },
    ],
  },
};
