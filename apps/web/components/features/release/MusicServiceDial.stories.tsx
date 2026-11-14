import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { MusicServiceDial } from './MusicServiceDial';

const providers = [
  {
    key: 'spotify' as const,
    label: 'Spotify',
    url: 'https://open.spotify.com',
  },
  {
    key: 'apple_music' as const,
    label: 'Apple Music',
    url: 'https://music.apple.com',
  },
  { key: 'deezer' as const, label: 'Deezer', url: 'https://www.deezer.com' },
];

const meta = {
  title: 'Release/MusicServiceDial',
  component: MusicServiceDial,
  parameters: { layout: 'centered', backgrounds: { default: 'dark' } },
  decorators: [
    Story => (
      <div className='w-80 rounded-3xl bg-surface-2 p-4'>
        <Story />
      </div>
    ),
  ],
  args: { providers, utmParams: {}, onStream: fn() },
} satisfies Meta<typeof MusicServiceDial>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ThreeServices: Story = {};

export const OneService: Story = {
  args: { providers: providers.slice(0, 1) },
};

/** No streaming service for this release: the dial renders nothing. */
export const EmptyNoServices: Story = {
  args: { providers: [] },
};

/** Every major service in the caller's order; the dial scrolls them. */
export const ManyServices: Story = {
  args: {
    providers: [
      ...providers,
      { key: 'tidal', label: 'TIDAL', url: 'https://tidal.com' },
      {
        key: 'amazon_music',
        label: 'Amazon Music',
        url: 'https://music.amazon.com',
      },
      {
        key: 'youtube_music',
        label: 'YouTube Music',
        url: 'https://music.youtube.com',
      },
      {
        key: 'soundcloud',
        label: 'SoundCloud',
        url: 'https://soundcloud.com',
      },
      { key: 'bandcamp', label: 'Bandcamp', url: 'https://bandcamp.com' },
    ],
  },
};

/** The dial inside a right-to-left page. */
export const Rtl: Story = {
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
};
