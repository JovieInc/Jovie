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
    headline: 'Control how the world sees you.',
    description: 'Find what the internet knows. Turn it into relationships.',
  },
};

export const TextHidden: Story = {
  args: {
    headline: 'Control how the world sees you.',
    description: 'Find what the internet knows. Turn it into relationships.',
    showText: false,
  },
};
