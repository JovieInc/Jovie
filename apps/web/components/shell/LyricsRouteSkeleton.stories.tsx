import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { LyricsRouteSkeleton } from './LyricsRouteSkeleton';

const meta = {
  title: 'Shell/LyricsRouteSkeleton',
  component: LyricsRouteSkeleton,
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof LyricsRouteSkeleton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
