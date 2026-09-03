import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { LyricsTimeline } from './LyricsTimeline';

const meta = {
  title: 'Shell/LyricsTimeline',
  component: LyricsTimeline,
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof LyricsTimeline>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
