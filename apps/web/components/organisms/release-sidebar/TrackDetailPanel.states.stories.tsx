import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ReactNode } from 'react';
import type { TrackForDetail } from './TrackDetailPanel';
import { TrackDetailPanel } from './TrackDetailPanel';

const track: TrackForDetail = {
  title: 'Summer Lights (Radio Edit)',
  smartLinkPath: '/smart/track-1',
  trackNumber: 2,
  discNumber: 1,
  durationMs: 187_000,
  isrc: 'USABC2600001',
  isExplicit: false,
  providers: [
    { key: 'spotify', label: 'Spotify', url: 'https://open.spotify.com/t/1' },
    {
      key: 'apple_music',
      label: 'Apple Music',
      url: 'https://music.apple.com/t/1',
    },
  ],
};

function Frame(Story: () => ReactNode) {
  return (
    <div className='w-80'>
      <Story />
    </div>
  );
}

function RtlFrame(Story: () => ReactNode) {
  return (
    <div dir='rtl' className='w-80'>
      <Story />
    </div>
  );
}

/**
 * State coverage for the track detail panel. The canonical stories stay in
 * TrackDetailPanel.stories.tsx; these use the same track and change the copy
 * length and the document direction.
 */
const meta = {
  title: 'Organisms/ReleaseSidebar/TrackDetailPanel States',
  component: TrackDetailPanel,
  parameters: { layout: 'centered' },
  decorators: [Frame],
  args: {
    track,
    releaseTitle: 'Summer Lights',
    onBack: () => {},
  },
} satisfies Meta<typeof TrackDetailPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Long content: long track and release titles on a multi-disc explicit track. */
export const LongContentTitles: Story = {
  args: {
    releaseTitle:
      'Summer Lights (Extended Deluxe Anniversary Edition with Bonus Remixes)',
    track: {
      ...track,
      title:
        'Summer Lights (Radio Edit featuring The Northern Hemisphere Orchestra and Choir)',
      discNumber: 2,
      trackNumber: 14,
      isExplicit: true,
    },
  },
};

/** Right-to-left: the panel inside an RTL document. */
export const RtlDocument: Story = {
  args: {
    releaseTitle: 'أضواء الصيف',
    track: { ...track, title: 'أضواء الصيف (نسخة الراديو)' },
  },
  decorators: [RtlFrame],
};
