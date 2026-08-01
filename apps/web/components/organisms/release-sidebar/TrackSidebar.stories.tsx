import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { TrackSidebar, type TrackSidebarData } from './TrackSidebar';

const mockTrack = {
  id: 'track-1',
  title: 'Midnight Echo',
  slug: 'midnight-echo',
  smartLinkPath: '/r/midnight-echo/track-1',
  trackNumber: 1,
  discNumber: 1,
  durationMs: 181000,
  isrc: 'USRC17607839',
  isExplicit: false,
  previewUrl: null,
  audioUrl: null,
  audioFormat: null,
  previewSource: null,
  previewVerification: 'unknown',
  providerConfidenceSummary: {
    canonical: 1,
    searchFallback: 0,
    unknown: 3,
    unresolvedProviders: ['apple_music', 'youtube', 'soundcloud'],
  },
  providers: [
    {
      key: 'spotify',
      label: 'Spotify',
      url: 'https://open.spotify.com/track/123',
      confidence: 'canonical',
    },
  ],
  releaseTitle: 'Midnight Echo (EP)',
  releaseArtworkUrl: null,
  releaseId: 'release-1',
} as TrackSidebarData;

const meta = {
  title: 'Organisms/ReleaseSidebar/TrackSidebar',
  component: TrackSidebar,
  parameters: {
    layout: 'centered',
    jovie: {
      uncoveredProps: ['disabled'],
    },
  },
} satisfies Meta<typeof TrackSidebar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    track: mockTrack,
    isOpen: true,
    onClose: () => undefined,
    onBackToRelease: () => undefined,
  },
};
