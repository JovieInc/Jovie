import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { LabelPills } from './LabelPills';

const meta = {
  title: 'Shell/LabelPills',
  component: LabelPills,
  parameters: {
    layout: 'centered',
    jovie: {
      uncoveredProps: ['labels'],
    },
  },
} satisfies Meta<typeof LabelPills>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
