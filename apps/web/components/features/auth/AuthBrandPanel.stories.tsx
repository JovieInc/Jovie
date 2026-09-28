import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { AuthBrandPanel } from './AuthBrandPanel';

const meta = {
  title: 'Features/Auth/AuthBrandPanel',
  component: AuthBrandPanel,
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof AuthBrandPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    headline: 'A living identity for the internet.',
    description:
      'Your work, your links, your next chapter. Together in your Jovie profile.',
  },
};

export const TextHidden: Story = {
  args: {
    headline: 'A living identity for the internet.',
    description:
      'Your work, your links, your next chapter. Together in your Jovie profile.',
    showText: false,
  },
};
