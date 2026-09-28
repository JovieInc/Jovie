import type { Meta, StoryObj } from '@storybook/nextjs-vite';
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

const meta = {
  title: 'Organisms/ReleaseSidebar/TrackDetailPanel',
  component: TrackDetailPanel,
  parameters: { layout: 'centered' },
  decorators: [
    Story => (
      <div className='w-80'>
        <Story />
      </div>
    ),
  ],
  args: {
    track,
    releaseTitle: 'Summer Lights',
    onBack: () => {},
  },
} satisfies Meta<typeof TrackDetailPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const NoIsrc: Story = {
  args: { track: { ...track, isrc: null } },
};
