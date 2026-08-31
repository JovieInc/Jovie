import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { LyricRow } from './LyricRow';

const meta = {
  title: 'Shell/LyricRow',
  component: LyricRow,
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof LyricRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
