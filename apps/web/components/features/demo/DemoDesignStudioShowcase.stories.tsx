import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { DemoDesignStudioShowcase } from './DemoDesignStudioShowcase';

const meta = {
  title: 'Features/Demo/DemoDesignStudioShowcase',
  component: DemoDesignStudioShowcase,
  parameters: { layout: 'fullscreen' },
  args: {
    itemId: 'lyrics-view',
    testId: 'demo-showcase-shell-lyrics',
  },
} satisfies Meta<typeof DemoDesignStudioShowcase>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Lyrics: Story = {};
export const Library: Story = {
  args: { itemId: 'library-view', testId: 'demo-showcase-shell-library' },
};
export const Track: Story = {
  args: { itemId: 'track-view', testId: 'demo-showcase-shell-track' },
};
export const Command: Story = {
  args: {
    itemId: 'music-ai-command-surface',
    testId: 'demo-showcase-music-ai-command',
  },
};
