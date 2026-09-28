import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { ConnectedReleaseEmptyState } from './ReleaseProviderMatrixNotices';

const meta = {
  title: 'Dashboard/Releases/ConnectedReleaseEmptyState',
  component: ConnectedReleaseEmptyState,
  args: {
    visible: true,
    canCreateManualReleases: true,
    isSyncing: false,
    onSync: fn(),
    onCreateManual: fn(),
  },
} satisfies Meta<typeof ConnectedReleaseEmptyState>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Syncing: Story = {
  args: {
    isSyncing: true,
  },
};

export const NoManualCreate: Story = {
  args: {
    canCreateManualReleases: false,
  },
};
