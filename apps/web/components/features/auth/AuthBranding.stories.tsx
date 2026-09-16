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
    title: 'Control how the world sees you.',
    description: 'Find what the internet knows. Turn it into relationships.',
  },
};

export const TextHidden: Story = {
  args: {
    title: 'Control how the world sees you.',
    description: 'Find what the internet knows. Turn it into relationships.',
    showText: false,
  },
};
