import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { UpdateAvailablePillView } from './UpdateAvailablePill';

const meta = {
  title: 'Molecules/UpdateAvailablePill',
  component: UpdateAvailablePillView,
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof UpdateAvailablePillView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Downloading: Story = {
  args: {
    state: 'downloading',
    onClick: () => undefined,
  },
};

export const ReadyToRestart: Story = {
  args: {
    state: 'ready-to-restart',
    onClick: () => undefined,
  },
};
