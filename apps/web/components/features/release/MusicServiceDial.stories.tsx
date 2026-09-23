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
