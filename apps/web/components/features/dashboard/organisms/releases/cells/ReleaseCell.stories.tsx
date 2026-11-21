import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ReleaseViewModel } from '@/lib/discography/types';
import { ReleaseCell } from './ReleaseCell';

const release: ReleaseViewModel = {
  profileId: 'profile-1',
  id: 'release-1',
  title: 'Skyline Dreams',
  slug: 'skyline-dreams',
  releaseType: 'single',
  status: 'released',
  isExplicit: false,
  releaseDate: '2026-01-01',
  artworkUrl: undefined,
  totalTracks: 1,
  providers: [],
  spotifyPopularity: null,
  smartLinkPath: '/smart/release-1',
  previewUrl: 'https://cdn.example.com/preview.mp3',
  primaryIsrc: null,
  upc: null,
};

const meta = {
  title: 'Features/Dashboard/Organisms/Releases/Cells/ReleaseCell',
  component: ReleaseCell,
  parameters: {
    layout: 'centered',
  },
  args: {
    release,
    artistName: 'Jovie Artist',
  },
} satisfies Meta<typeof ReleaseCell>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const NoPreview: Story = {
  args: {
    release: { ...release, previewUrl: null },
  },
};

/** Empty: a release with no artist credit and nothing to show beside the title. */
export const EmptyNoArtist: Story = {
  args: {
    artistName: null,
    release: { ...release, previewUrl: null, artistNames: [] },
    showType: false,
  },
};

/** Partial: a release with only the required fields and a selectable row. */
export const PartialRequiredOnly: Story = {
  args: {
    artistName: undefined,
    onSelect: () => undefined,
    release: { ...release, releaseType: undefined, releaseDate: undefined },
  },
};

/** Long content: a title and artist line far past the cell width. */
export const LongContentTitle: Story = {
  args: {
    artistName:
      'An Artist With A Very Long Stage Name And Several Collaborators',
    release: {
      ...release,
      title:
        'Skyline Dreams (Extended Mix) with a very long subtitle that cannot fit on one line',
    },
  },
  decorators: [
    function NarrowFrame(Story) {
      return (
        <div className='w-64'>
          <Story />
        </div>
      );
    },
  ],
};

/** Rtl: an Arabic title inside a right-to-left container. */
export const RtlTitle: Story = {
  args: {
    artistName: 'فنان',
    release: { ...release, title: 'أحلام الأفق' },
  },
  decorators: [
    function RtlFrame(Story) {
      return (
        <div dir='rtl'>
          <Story />
        </div>
      );
    },
  ],
};
