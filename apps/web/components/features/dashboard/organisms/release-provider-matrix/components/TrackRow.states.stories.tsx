import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ProviderKey, TrackViewModel } from '@/lib/discography/types';
import { TrackRow, TrackRowsContainer } from './TrackRow';

const allProviders: ProviderKey[] = ['spotify', 'apple_music'];

const providerConfig = {
  spotify: { label: 'Spotify', accent: '#1ED760' },
  apple_music: { label: 'Apple Music', accent: '#FA243C' },
} as Record<ProviderKey, { label: string; accent: string }>;

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
  providers: [],
};

const meta = {
  title: 'Dashboard/Organisms/ReleaseProviderMatrix/TrackRow/States',
  component: TrackRow,
  parameters: { layout: 'padded' },
  args: { track, providerConfig, allProviders, columnCount: 9 },
  render: args => (
    <div className='w-96'>
      <TrackRow {...args} renderMode='stack' />
    </div>
  ),
} satisfies Meta<typeof TrackRow>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: a release with no tracks. */
export const Empty: Story = {
  render: () => (
    <div className='w-96'>
      <TrackRowsContainer
        tracks={[]}
        providerConfig={providerConfig}
        allProviders={allProviders}
        columnCount={9}
        renderMode='stack'
      />
    </div>
  ),
};

/** Partial: no duration, no ISRC, no preview and no DSP links. */
export const Partial: Story = {
  args: {
    track: {
      ...track,
      durationMs: null,
      isrc: null,
      previewUrl: null,
      audioUrl: null,
    },
  },
};

/** Long content: a title that truncates and an explicit badge. */
export const LongContent: Story = {
  args: {
    track: {
      ...track,
      isExplicit: true,
      title:
        'An Extraordinarily Long Track Title That Keeps Going Past The Card Width',
    },
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
  args: { track: { ...track, title: 'أحلام الأفق' } },
};
