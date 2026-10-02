import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { TableRowActions } from './TableRowActions';

const meta = {
  title: 'Features/Admin/TableRowActions',
  component: TableRowActions,
  parameters: {
    layout: 'centered',
  },
  args: {
    isVerified: false,
    isClaimed: true,
    verificationStatus: 'idle',
    refreshIngestStatus: 'idle',
    onToggleVerification: async () => {},
    onRefreshIngest: async () => {},
  },
} satisfies Meta<typeof TableRowActions>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Unverified: Story = {};

export const Verified: Story = {
  args: {
    isVerified: true,
  },
};

export const Loading: Story = {
  args: {
    verificationStatus: 'loading',
    refreshIngestStatus: 'loading',
  },
};
