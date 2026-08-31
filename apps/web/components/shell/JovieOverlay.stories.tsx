import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { JovieOverlay } from './JovieOverlay';

const meta = {
  title: 'Shell/JovieOverlay',
  component: JovieOverlay,
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof JovieOverlay>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
