import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { OutreachOverviewPanel } from './OutreachOverviewPanel';

const meta = {
  title: 'Features/Admin/Outreach/OutreachOverviewPanel',
  component: OutreachOverviewPanel,
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof OutreachOverviewPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
