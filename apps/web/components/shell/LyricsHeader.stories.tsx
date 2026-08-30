import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { LyricsHeader } from './LyricsHeader';

const meta = {
  title: 'Shell/LyricsHeader',
  component: LyricsHeader,
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof LyricsHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
