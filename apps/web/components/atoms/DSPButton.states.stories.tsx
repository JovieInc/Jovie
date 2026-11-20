import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { DSPButton } from './DSPButton';

const SPOTIFY_LOGO =
  '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" width="20" height="20"><circle cx="12" cy="12" r="10" fill="currentColor"/></svg>';

/** Rendered states of the streaming service button, beside DSPButton.stories.tsx. */
const meta = {
  title: 'Atoms/DSPButton States',
  component: DSPButton,
  parameters: {
    layout: 'centered',
  },
  args: {
    name: 'Spotify',
    dspKey: 'spotify',
    url: 'https://open.spotify.com/artist/example',
    backgroundColor: '#1DB954',
    textColor: '#000000',
    logoSvg: SPOTIFY_LOGO,
    onClick: fn(),
  },
  decorators: [
    Story => (
      <div className='w-72'>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof DSPButton>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Partial: the service sent no logo or brand colour, so only the label shows. */
export const PartialNoLogo: Story = {
  args: {
    logoSvg: '',
    backgroundColor: '',
    textColor: '',
  },
};

/** Long content: a long service name in the narrow profile column. */
export const LongContentServiceName: Story = {
  args: {
    name: 'Amazon Music Unlimited HD and Spatial Audio',
    dspKey: 'amazon_music',
    url: 'https://music.amazon.com/artists/example',
  },
};

/** Right-to-left: an Arabic profile keeps the logo before the label. */
export const RtlArabicProfile: Story = {
  args: {
    name: 'أنغامي',
    dspKey: 'anghami',
    url: 'https://play.anghami.com/artist/example',
  },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar' className='w-72'>
        <Story />
      </div>
    ),
  ],
};
