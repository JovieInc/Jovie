import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ProfileDesktopSideRailRows } from './ProfileDesktopSideRailRows';

const meta = {
  title: 'Features/Profile/ProfileDesktopSideRailRows',
  component: ProfileDesktopSideRailRows,
  parameters: { layout: 'centered' },
  decorators: [
    Story => (
      <div className='w-80 bg-base p-4'>
        <Story />
      </div>
    ),
  ],
  args: {
    artistName: 'Tim White',
    showUpdates: true,
    isSubscribed: false,
    showArtistEmailRow: false,
    hasTip: true,
    onGetUpdates: () => {},
    onOpenPayments: () => {},
  },
} satisfies Meta<typeof ProfileDesktopSideRailRows>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Subscribed: Story = {
  args: { isSubscribed: true, showArtistEmailRow: true },
};

export const UpdatesOnly: Story = { args: { hasTip: false } };
