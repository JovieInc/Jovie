import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ProviderKey, TrackViewModel } from '@/lib/discography/types';
import { TrackRow, TrackRowsContainer } from './TrackRow';

const allProviders: ProviderKey[] = ['spotify', 'apple_music', 'youtube_music'];

const providerConfig: Record<ProviderKey, { label: string; accent: string }> = {
  spotify: { label: 'Spotify', accent: '#1ED760' },
  apple_music: { label: 'Apple Music', accent: '#FA243C' },
  youtube: { label: 'YouTube', accent: '#FF0000' },
  youtube_music: { label: 'YouTube Music', accent: '#FF0000' },
  soundcloud: { label: 'SoundCloud', accent: '#FF7700' },
  deezer: { label: 'Deezer', accent: '#A238FF' },
  tidal: { label: 'Tidal', accent: '#000000' },
  amazon_music: { label: 'Amazon Music', accent: '#00A8E1' },
  bandcamp: { label: 'Bandcamp', accent: '#629AA9' },
  beatport: { label: 'Beatport', accent: '#01FF95' },
  pandora: { label: 'Pandora', accent: '#224099' },
  napster: { label: 'Napster', accent: '#000000' },
  audiomack: { label: 'Audiomack', accent: '#FFA200' },
  qobuz: { label: 'Qobuz', accent: '#000000' },
} as Record<ProviderKey, { label: string; accent: string }>;

function makeTrackProvider(key: ProviderKey, primary = false) {
  return {
    key,
    url: `https://example.com/${key}/track-1`,
    source: 'ingested' as const,
    updatedAt: '2026-01-01T00:00:00.000Z',
    label: providerConfig[key].label,
    path: `/${key}/track-1`,
    isPrimary: primary,
  };
}

const track: TrackViewModel = {
  id: 'track-1',
  releaseId: 'release-1',
  releaseSlug: 'skyline-dreams',
  title: 'Skyline Dreams',
  slug: 'skyline-dreams-track',
  smartLinkPath: '/smart/release-1/track-1',
  trackNumber: 1,
  discNumber: 1,
  durationMs: 214_000,
  isrc: 'US-ABC-26-00001',
  isExplicit: false,
  previewUrl: 'https://cdn.example.com/preview.mp3',
  audioUrl: 'https://cdn.example.com/preview.mp3',
  audioFormat: 'mp3',
  providers: [
    makeTrackProvider('spotify', true),
    makeTrackProvider('apple_music'),
  ],
};

const meta = {
  title: 'Dashboard/Organisms/ReleaseProviderMatrix/TrackRow',
  component: TrackRow,
  parameters: {
    layout: 'padded',
  },
  args: {
    track,
    providerConfig,
    allProviders,
    columnCount: 9,
  },
} satisfies Meta<typeof TrackRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Table: Story = {
  render: args => (
    <table className='w-full'>
      <tbody>
        <TrackRow {...args} />
      </tbody>
    </table>
  ),
};

export const TableSelected: Story = {
  args: {
    isSelected: true,
    onClick: () => {},
  },
  render: args => (
    <table className='w-full'>
      <tbody>
        <TrackRow {...args} />
      </tbody>
    </table>
  ),
};

export const Stack: Story = {
  args: {
    renderMode: 'stack',
  },
  render: args => (
    <div className='w-96'>
      <TrackRow {...args} />
    </div>
  ),
};

export const StackNoPreview: Story = {
  args: {
    renderMode: 'stack',
    track: { ...track, previewUrl: null, audioUrl: null },
  },
  render: args => (
    <div className='w-96'>
      <TrackRow {...args} />
    </div>
  ),
};

export const StackExplicitNoLinks: Story = {
  args: {
    renderMode: 'stack',
    track: { ...track, isExplicit: true, providers: [] },
  },
  render: args => (
    <div className='w-96'>
      <TrackRow {...args} />
    </div>
  ),
};

export const ExpandedRelease: Story = {
  render: args => (
    <table className='w-full'>
      <tbody>
        <TrackRowsContainer
          tracks={[
            args.track,
            { ...args.track, id: 'track-2', trackNumber: 2 },
          ]}
          providerConfig={args.providerConfig}
          allProviders={args.allProviders}
          columnCount={args.columnCount}
        />
      </tbody>
    </table>
  ),
};
