import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { StatusCell } from './StatusCell';

const meta = {
  title: 'Design System/Data Grid/Cells/StatusCell',
  component: StatusCell,
  parameters: { layout: 'centered' },
  args: { tone: 'positive', children: 'High' },
} satisfies Meta<typeof StatusCell>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
