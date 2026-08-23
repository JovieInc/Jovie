import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { TrackDetailPanel } from './TrackDetailPanel';

const meta = {
  title: 'Organisms/ReleaseSidebar/TrackDetailPanel',
  component: TrackDetailPanel,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof TrackDetailPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    releaseTitle: 'Midnight Drive',
    onBack: () => undefined,
    track: {
      title: 'Midnight Echo',
      smartLinkPath: '/tim/midnight-drive/midnight-echo',
      trackNumber: 1,
      discNumber: 1,
      durationMs: 185000,
      isrc: 'USRC17607839',
      isExplicit: false,
      providers: [
        {
          key: 'spotify',
          label: 'Spotify',
          url: 'https://open.spotify.com/track/example',
        },
      ],
    },
  },
};
