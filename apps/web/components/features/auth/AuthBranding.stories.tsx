import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { AuthBranding } from './AuthBranding';

const meta = {
  title: 'Auth/AuthBranding',
  component: AuthBranding,
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof AuthBranding>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    title: 'Built For Artists.',
    description:
      'Manage releases, links, and audience signals from one focused workspace.',
  },
};

export const TextHidden: Story = {
  args: {
    title: 'Built For Artists.',
    description:
      'Manage releases, links, and audience signals from one focused workspace.',
    showText: false,
  },
};
