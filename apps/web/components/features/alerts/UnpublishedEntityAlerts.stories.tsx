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

/** A long artist name and release title wrap inside the copy column. */
export const LongContentNameAndTitle: Story = {
  args: {
    artist: {
      ...mockArtist,
      name: 'The Los Angeles After Hours Orchestra and Friends',
    },
    entityTitle: 'Never Say A Word (Extended Club Mix) feat. Sunrise Set',
  },
};

/** The opt-in inside a right-to-left page. */
export const Rtl: Story = {
  args: {
    artist: { ...mockArtist, name: 'تيم وايت' },
    entityTitle: 'منتصف الليل',
  },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
};
