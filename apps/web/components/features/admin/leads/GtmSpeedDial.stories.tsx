import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { GtmSpeedDial } from './GtmSpeedDial';

const meta = {
  title: 'Features/Admin/Leads/GtmSpeedDial',
  component: GtmSpeedDial,
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof GtmSpeedDial>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
