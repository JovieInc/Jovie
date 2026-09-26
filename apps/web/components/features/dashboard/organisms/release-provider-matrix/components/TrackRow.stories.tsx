import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ComponentType } from 'react';
import type {
  ProviderKey,
  ReleaseViewModel,
  TrackViewModel,
} from '@/lib/discography/types';
import { TrackRow, TrackRowsContainer } from './TrackRow';

const providerConfig = {
  spotify: { label: 'Spotify', accent: '#1DB954' },
  apple_music: { label: 'Apple Music', accent: '#FC3C44' },
} as Record<ProviderKey, { label: string; accent: string }>;

const allProviders: ProviderKey[] = ['spotify', 'apple_music'];

const release: ReleaseViewModel = {
  profileId: 'profile-1',
  id: 'release-1',
  title: 'Summer Lights',
  artistNames: ['Jovie Artist'],
  slug: 'summer-lights',
  status: 'released',
  releaseType: 'single',
  isExplicit: false,
  releaseDate: '2026-06-15',
  totalTracks: 2,
  providers: [],
  smartLinkPath: '/smart/summer-lights',
};

const track: TrackViewModel = {
  id: 'track-1',
  releaseId: 'release-1',
  releaseSlug: 'summer-lights',
  title: 'Open Skies',
  slug: 'open-skies',
  smartLinkPath: '/smart/summer-lights/open-skies',
  trackNumber: 1,
  discNumber: 1,
  durationMs: 214000,
  isrc: 'USRC17607839',
  isExplicit: false,
  previewUrl: 'https://cdn.example.com/track.mp3',
  audioUrl: null,
  audioFormat: null,
  providers: [
    {
      key: 'spotify',
      url: 'https://open.spotify.com/track/1',
      source: 'ingested',
      updatedAt: '2026-01-01T00:00:00.000Z',
      label: 'Spotify',
      path: '/spotify/track/1',
      isPrimary: true,
    },
  ],
};

const tracks: TrackViewModel[] = [
  track,
  {
    ...track,
    id: 'track-2',
    title: 'Night Drive',
    slug: 'night-drive',
    trackNumber: 2,
    isrc: 'USRC17607840',
    isExplicit: true,
    providers: [],
  },
];

const padded = [
  (Story: ComponentType) => (
    <div className='w-full max-w-md'>
      <Story />
    </div>
  ),
];

const meta = {
  title: 'Features/Dashboard/Release Provider Matrix/TrackRow',
  component: TrackRow,
  parameters: { layout: 'padded' },
  decorators: padded,
  args: {
    track,
    release,
    providerConfig,
    allProviders,
    columnCount: 11,
    renderMode: 'stack',
  },
} satisfies Meta<typeof TrackRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Stack: Story = {};

export const StackSelected: Story = { args: { isSelected: true } };

export const Table: Story = {
  args: {
    renderMode: 'table',
    columnVisibility: {
      select: true,
      release: true,
      availability: true,
      metrics: true,
      primaryIsrc: true,
      actions: true,
    },
  },
  decorators: [
    Story => (
      <table className='w-full'>
        <tbody>
          <Story />
        </tbody>
      </table>
    ),
  ],
};

export const ContainerStack: Story = {
  render: () => (
    <TrackRowsContainer
      tracks={tracks}
      release={release}
      providerConfig={providerConfig}
      allProviders={allProviders}
      columnCount={11}
      renderMode='stack'
    />
  ),
};
