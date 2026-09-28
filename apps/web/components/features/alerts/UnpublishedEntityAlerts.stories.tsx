import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { mockArtist } from '@/lib/test-utils/mock-data';
import {
  UnpublishedEntityAlerts,
  UnpublishedEntityAlertsFallback,
} from './UnpublishedEntityAlerts';

const meta = {
  title: 'Features/Alerts/UnpublishedEntityAlerts',
  component: UnpublishedEntityAlerts,
  parameters: {
    layout: 'centered',
  },
  args: {
    artist: mockArtist,
  },
} satisfies Meta<typeof UnpublishedEntityAlerts>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithEntityTitle: Story = {
  args: {
    entityTitle: 'Midnight Drive',
  },
};

export const Loading: Story = {
  render: () => <UnpublishedEntityAlertsFallback />,
};
