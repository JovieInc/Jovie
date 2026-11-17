import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ReactNode } from 'react';
import type { ProviderKey } from '@/lib/discography/types';
import { TrackPlatformLinksSection } from './TrackPlatformLinksSection';

function Frame(Story: () => ReactNode) {
  return (
    <div className='w-80 max-w-full'>
      <Story />
    </div>
  );
}

function RtlFrame(Story: () => ReactNode) {
  return (
    <div dir='rtl' className='w-80 max-w-full'>
      <Story />
    </div>
  );
}

/**
 * State coverage for a track's DSP links. The canonical stories stay in
 * TrackPlatformLinksSection.stories.tsx; these change how many providers the
 * track has and the document direction.
 */
const meta = {
  title: 'Organisms/ReleaseSidebar/TrackPlatformLinksSection States',
  decorators: [Frame],
  component: TrackPlatformLinksSection,
  parameters: {
    layout: 'centered',
  },
  args: {
    findQuery: 'Midnight Drive',
    providers: [
      {
        key: 'spotify' as ProviderKey,
        label: 'Spotify',
        url: 'https://open.spotify.com/track/example',
      },
    ],
    missingProviders: [{ key: 'apple_music' as ProviderKey }],
  },
} satisfies Meta<typeof TrackPlatformLinksSection>;

export default meta;
type Story = StoryObj<typeof meta>;

const linked = [
  'spotify',
  'youtube_music',
  'deezer',
  'tidal',
  'amazon_music',
  'soundcloud',
  'bandcamp',
  'beatport',
].map(key => ({
  key: key as ProviderKey,
  label: key,
  url: `https://example.com/${key}/track`,
}));

/** Long content: eight linked DSPs and four still missing, each with Find. */
export const LongContentManyProviders: Story = {
  args: {
    providers: linked,
    missingProviders: ['apple_music', 'pandora', 'qobuz', 'audiomack'].map(
      key => ({ key: key as ProviderKey })
    ),
  },
};

/** Right-to-left: linked and missing rows inside an RTL document. */
export const RtlDocument: Story = {
  args: { findQuery: 'قيادة منتصف الليل' },
  decorators: [RtlFrame],
};
