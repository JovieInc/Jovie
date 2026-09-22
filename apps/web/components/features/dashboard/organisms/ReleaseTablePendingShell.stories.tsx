import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ReleaseTablePendingShell } from './ReleaseTablePendingShell';

const meta: Meta<typeof ReleaseTablePendingShell> = {
  title: 'Dashboard/Releases/ReleaseTablePendingShell',
  component: ReleaseTablePendingShell,
  parameters: {
    layout: 'fullscreen',
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {},
};

export const NoHeader: Story = {
  args: { showHeader: false },
};
