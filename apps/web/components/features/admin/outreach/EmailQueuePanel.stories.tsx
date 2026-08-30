import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { EmailQueuePanel } from './EmailQueuePanel';

const meta = {
  title: 'Features/Admin/Outreach/EmailQueuePanel',
  component: EmailQueuePanel,
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof EmailQueuePanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
