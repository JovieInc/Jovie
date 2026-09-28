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
    title: 'Your living identity on the internet.',
    description:
      'Your work, your links, your next chapter. Together in your Jovie profile.',
  },
};

export const TextHidden: Story = {
  args: {
    title: 'Your living identity on the internet.',
    description:
      'Your work, your links, your next chapter. Together in your Jovie profile.',
    showText: false,
  },
};
