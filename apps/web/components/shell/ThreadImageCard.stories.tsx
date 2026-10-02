import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ThreadImageCard } from './ThreadImageCard';

const meta = {
  title: 'Shell/ThreadImageCard',
  component: ThreadImageCard,
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof ThreadImageCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Generating: Story = {
  args: {
    status: 'generating',
    prompt: 'A neon-lit tour poster for a synthwave album',
  },
};

export const Ready: Story = {
  args: {
    status: 'ready',
    prompt: 'A neon-lit tour poster for a synthwave album',
    previewUrl: 'https://placehold.co/768x432/111827/f5f5f5?text=Preview',
    onDownload: () => {},
    onCopy: () => {},
    onRegenerate: () => {},
  },
};

export const ReadyWithoutActions: Story = {
  args: {
    status: 'ready',
    prompt: 'A neon-lit tour poster for a synthwave album',
    previewUrl: 'https://placehold.co/768x432/111827/f5f5f5?text=Preview',
  },
};
