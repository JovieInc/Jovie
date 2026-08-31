import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { GrowthStatusPanel } from './GrowthStatusPanel';

const meta = {
  title: 'Features/Admin/Leads/GrowthStatusPanel',
  component: GrowthStatusPanel,
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof GrowthStatusPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
