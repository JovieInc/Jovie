import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { FooterBranding } from './FooterBranding';

const meta = {
  title: 'Molecules/FooterBranding',
  component: FooterBranding,
  parameters: {
    layout: 'centered',
  },
  args: {
    mark: 'icon',
    size: 'sm',
    showCTA: false,
  },
} satisfies Meta<typeof FooterBranding>;

export default meta;
type Story = StoryObj<typeof meta>;

export const IconMark: Story = {};
