import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import type { ReleaseViewModel } from '@/lib/discography/types';
import { MobileReleaseList } from './MobileReleaseList';

const release: ReleaseViewModel = {
  profileId: 'profile-1',
  id: 'release-1',
  title: 'Summer Lights',
  artistNames: ['Jovie Artist'],
  slug: 'summer-lights',
  releaseType: 'single',
  isExplicit: false,
  releaseDate: '2026-06-15',
  artworkUrl: undefined,
  totalTracks: 1,
  providers: [],
  spotifyPopularity: 67,
  smartLinkPath: '/summer-lights',
  previewUrl: null,
  primaryIsrc: null,
  upc: null,
  status: 'released',
};

const meta = {
  title: 'Dashboard/Releases/MobileReleaseList/States',
  component: MobileReleaseList,
  parameters: { layout: 'centered' },
  decorators: [
    function PhoneFrameDecorator(Story) {
      return (
        <div className='w-80 bg-surface-0 p-3 text-primary-token'>
          <Story />
        </div>
      );
    },
  ],
  args: {
    releases: [release],
    artistName: 'Jovie Artist',
    onEdit: fn(),
    onCopy: async () => 'Copied',
  },
} satisfies Meta<typeof MobileReleaseList>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: no releases to list. */
export const Empty: Story = { args: { releases: [] } };

/** Partial: a release with no date and no credited artists. */
export const PartialNoDate: Story = {
  args: {
    releases: [{ ...release, releaseDate: undefined, artistNames: [] }],
    groupByYear: true,
  },
};

/** Long content: a long title and a long credit list. */
export const LongContent: Story = {
  args: {
    releases: [
      {
        ...release,
        title:
          'The Extraordinarily Long Titled Deluxe Anniversary Edition of Summer Lights',
        artistNames: ['Jovie Artist', 'Guest Vocal', 'Another Guest', 'More'],
      },
    ],
  },
};

/** Rtl: right-to-left layout. */
export const Rtl: Story = {
  decorators: [
    function RtlDecorator(Story) {
      return (
        <div dir='rtl'>
          <Story />
        </div>
      );
    },
  ],
  args: { releases: [{ ...release, title: 'أضواء الصيف' }] },
};
