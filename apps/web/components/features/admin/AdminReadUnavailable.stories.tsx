import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { AdminReadUnavailable } from './AdminReadUnavailable';

const meta = {
  title: 'Features/Admin/AdminReadUnavailable',
  component: AdminReadUnavailable,
  parameters: { layout: 'padded', nextjs: { appDirectory: true } },
  args: {
    message:
      'Feature flag values could not be read. Changes are unavailable until the current values can be verified.',
  },
} satisfies Meta<typeof AdminReadUnavailable>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Flags: Story = {};
export const Costs: Story = {
  args: {
    message:
      'Manual cost records could not be read. Spend is unknown, not zero.',
  },
};
export const Connections: Story = {
  args: {
    message:
      'Publisher connection and playlist settings could not be read. Their status is unknown; changes are unavailable until the current settings can be verified.',
  },
};
