import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { SocialIcon } from './SocialIcon';

const meta = {
  title: 'Atoms/SocialIcon',
  component: SocialIcon,
  parameters: {
    layout: 'centered',
  },
  args: {
    platform: 'spotify',
    size: 24,
  },
} satisfies Meta<typeof SocialIcon>;

export default meta;
type Story = StoryObj<typeof meta>;

const MUSIC_PLATFORMS = [
  ['spotify', 'Spotify'],
  ['apple_music', 'Apple Music'],
  ['youtube_music', 'YouTube Music'],
  ['amazon_music', 'Amazon Music'],
  ['soundcloud', 'SoundCloud'],
  ['tidal', 'Tidal'],
  ['deezer', 'Deezer'],
  ['netease_music', 'NetEase Music'],
  ['qq_music', 'QQ Music'],
] as const;

export const Default: Story = {};

export const MusicServices: Story = {
  render: () => (
    <fieldset className='grid grid-cols-3 gap-4'>
      <legend className='sr-only'>Music services</legend>
      {MUSIC_PLATFORMS.map(([platform, label]) => (
        <div
          className='flex min-w-24 flex-col items-center gap-2 text-center text-sm text-secondary-token'
          key={platform}
        >
          <SocialIcon
            platform={platform}
            size={24}
            aria-hidden={false}
            aria-label={label}
          />
          <span>{label}</span>
        </div>
      ))}
    </fieldset>
  ),
};

export const UnknownPlatform: Story = {
  args: {
    platform: 'unknown-platform',
    'aria-hidden': false,
    'aria-label': 'Unknown platform',
  },
};
