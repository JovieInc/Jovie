import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { DspConnectionPill } from './DspConnectionPill';

const meta = {
  title: 'Dashboard/Atoms/DspConnectionPill',
  component: DspConnectionPill,
  parameters: {
    layout: 'centered',
  },
  args: {
    provider: 'spotify',
    connected: false,
  },
} satisfies Meta<typeof DspConnectionPill>;

export default meta;
type Story = StoryObj<typeof meta>;

export const NotConnected: Story = {
  args: {
    onClick: () => {},
  },
};

export const ConnectedNoActions: Story = {
  args: {
    connected: true,
    artistName: 'Sasha Waves',
  },
};

export const ConnectedWithMenu: Story = {
  args: {
    connected: true,
    artistName: 'Sasha Waves',
    onSyncNow: () => {},
    onDisconnect: () => {},
  },
};

export const Disabled: Story = {
  args: {
    disabled: true,
    onClick: () => {},
  },
};
