import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ProfilePreview } from './ProfilePreview';

const spotify = {
  id: 'spotify',
  title: 'Spotify',
  platform: 'spotify',
  url: 'https://open.spotify.com/artist/sashawaves',
  isVisible: true,
};

/**
 * State coverage for the dashboard profile preview. Same frame and base args
 * as the canonical stories; each state changes only the profile fields, the
 * links or the document direction.
 */
const meta = {
  title: 'Dashboard/Molecules/ProfilePreview States',
  component: ProfilePreview,
  parameters: { layout: 'centered' },
  decorators: [
    Story => (
      <div className='h-150 w-80'>
        <Story />
      </div>
    ),
  ],
  args: {
    username: 'sashawaves',
    displayName: 'Sasha Waves',
    links: [spotify],
  },
} satisfies Meta<typeof ProfilePreview>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Partial: no display name or avatar yet, so the handle stands in. */
export const PartialHandleOnly: Story = {
  args: { displayName: '', avatarUrl: null },
};

/** Long content: a long artist name and several links. */
export const LongContentNameAndLinks: Story = {
  args: {
    displayName: 'Sasha Waves and the Midnight Harbour Orchestra Collective',
    isVerified: true,
    links: [
      spotify,
      {
        id: 'apple',
        title: 'Apple Music',
        platform: 'apple_music',
        url: 'https://music.apple.com/artist/sashawaves',
        isVisible: true,
      },
      {
        id: 'youtube',
        title: 'YouTube',
        platform: 'youtube',
        url: 'https://youtube.com/@sashawaves',
        isVisible: true,
      },
      {
        id: 'instagram',
        title: 'Instagram',
        platform: 'instagram',
        url: 'https://instagram.com/sashawaves',
        isVisible: true,
      },
    ],
  },
};

/** Right-to-left: an Arabic display name inside an RTL document. */
export const RtlDocument: Story = {
  args: { displayName: 'ساشا ويفز' },
  decorators: [
    Story => (
      <div dir='rtl' className='h-150 w-80'>
        <Story />
      </div>
    ),
  ],
};
