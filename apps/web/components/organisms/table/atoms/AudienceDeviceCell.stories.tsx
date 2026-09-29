import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { AudienceDeviceCell } from './AudienceDeviceCell';

const meta = {
  title: 'Organisms/Table/Atoms/AudienceDeviceCell',
  component: AudienceDeviceCell,
  parameters: {
    layout: 'centered',
  },
  args: {
    deviceType: 'mobile',
  },
} satisfies Meta<typeof AudienceDeviceCell>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Mobile: Story = {};

export const Desktop: Story = {
  args: {
    deviceType: 'desktop',
  },
};

export const Unknown: Story = {
  args: {
    deviceType: null,
  },
};
