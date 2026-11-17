import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { SidebarNowPlaying } from './SidebarNowPlaying';

const artworkUrl = 'https://placehold.co/640x640/111827/E5E7EB?text=Artwork';

/** Rendered states of the sidebar now-playing card. */
const meta = {
  title: 'Shell/SidebarNowPlaying/States',
  component: SidebarNowPlaying,
  parameters: { layout: 'centered' },
  args: {
    isPlaying: false,
    playOverlayVisible: false,
    onPlay: fn(),
    track: {
      trackTitle: 'Never Say A Word',
      artistName: 'Tim White',
      artworkUrl,
    },
  },
} satisfies Meta<typeof SidebarNowPlaying>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: nothing is playing yet, so the card renders nothing. */
export const EmptyNothingPlaying: Story = {
  args: {
    track: { trackTitle: null, artistName: null, artworkUrl: null },
  },
};

/** Partial: metadata arrived before artwork and artist. */
export const PartialTitleOnly: Story = {
  args: {
    track: {
      trackTitle: 'Never Say A Word',
      artistName: null,
      artworkUrl: null,
    },
  },
};

/** Collapsed and playing: the artwork tile with its playing dot. */
export const PartialCollapsedPlaying: Story = {
  args: { collapsed: true, isPlaying: true, playOverlayVisible: true },
};

/** Long content: long title and artist truncate in a narrow rail. */
export const LongContentTrack: Story = {
  args: {
    track: {
      trackTitle:
        'Never Say A Word (Extended Club Mix with the Full Orchestral Intro)',
      artistName: 'Tim White, The Midnight Choir and Friends',
      artworkUrl,
    },
  },
  render: function LongContentTrackRender(args) {
    return (
      <div className='w-48'>
        <SidebarNowPlaying {...args} />
      </div>
    );
  },
};

/** RTL: thumbnail and text mirror in a right-to-left rail. */
export const RtlTrack: Story = {
  args: {
    track: { trackTitle: 'أغنية الليل', artistName: 'فرقة القمر', artworkUrl },
  },
  render: function RtlTrackRender(args) {
    return (
      <div dir='rtl' className='w-48'>
        <SidebarNowPlaying {...args} />
      </div>
    );
  },
};
