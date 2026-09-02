import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ChatUsageAlert } from './ChatUsageAlert';

const meta = {
  title: 'Jovie/Components/ChatUsageAlert',
  component: ChatUsageAlert,
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof ChatUsageAlert>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
