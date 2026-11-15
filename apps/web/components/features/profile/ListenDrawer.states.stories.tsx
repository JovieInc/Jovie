import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { buildDemoProfile } from '@/components/features/demo/mock-dashboard-data';
import { getAvailableDSPs } from '@/lib/dsp';
import { convertDrizzleCreatorProfileToArtist } from '@/types/db';
import { ListenDrawer } from './ListenDrawer';

const DEMO_ARTIST = convertDrizzleCreatorProfileToArtist(buildDemoProfile());

const meta = {
  title: 'Features/Profile/ListenDrawer States',
  component: ListenDrawer,
  parameters: { layout: 'fullscreen' },
  args: {
    open: true,
    onOpenChange: () => {},
    artist: DEMO_ARTIST,
    dsps: getAvailableDSPs(DEMO_ARTIST),
  },
} satisfies Meta<typeof ListenDrawer>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Long content: a long artist name in the drawer subtitle. */
export const LongContent: Story = {
  args: {
    artist: {
      ...DEMO_ARTIST,
      name: 'Tim White and the Late Night Los Angeles Orchestra featuring Everyone',
    },
  },
};

/** Rtl: an Arabic artist name in a right-to-left document. */
export const Rtl: Story = {
  args: { artist: { ...DEMO_ARTIST, name: 'تيم وايت' } },
  decorators: [
    function RtlDecorator(Story) {
      return (
        <div dir='rtl' lang='ar'>
          <Story />
        </div>
      );
    },
  ],
};
