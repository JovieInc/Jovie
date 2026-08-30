import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { LyricsView } from './LyricsView';

const meta = {
  title: 'Shell/LyricsView',
  component: LyricsView,
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof LyricsView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
