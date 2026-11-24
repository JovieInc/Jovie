import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { MeterCell } from './MeterCell';

const meta = {
  title: 'Design System/Data Grid/Cells/MeterCell',
  component: MeterCell,
  parameters: { layout: 'centered' },
  args: { value: 70, label: 'Engagement' },
} satisfies Meta<typeof MeterCell>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
