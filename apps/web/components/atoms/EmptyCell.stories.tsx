import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { EmptyCell } from './EmptyCell';

const meta = {
  title: 'Atoms/EmptyCell',
  component: EmptyCell,
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof EmptyCell>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithTooltip: Story = {
  args: {
    tooltip: 'No release date set',
  },
};
