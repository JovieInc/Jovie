import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { DmQueuePanel } from './DmQueuePanel';

const meta = {
  title: 'Features/Admin/Outreach/DmQueuePanel',
  component: DmQueuePanel,
  parameters: {
    layout: 'centered',
    jovie: {
      uncoveredProps: ['loading'],
    },
  },
} satisfies Meta<typeof DmQueuePanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
