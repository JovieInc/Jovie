import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import type { LegacySocialLink } from '@/types/db';
import { SocialLink } from './SocialLink';

const RtlFrame: Decorator = function RtlFrame(Story) {
  return (
    <div dir='rtl'>
      <Story />
    </div>
  );
};

const meta: Meta<typeof SocialLink> = {
  title: 'Molecules/SocialLink States',
  component: SocialLink,
  parameters: {
    layout: 'centered',
  },
};

export default meta;
type Story = StoryObj<typeof SocialLink>;

const createLink = (platform: string, url: string): LegacySocialLink => ({
  id: `link-${platform}`,
  artist_id: 'profile-1',
  platform,
  url,
  clicks: 0,
  created_at: '2026-01-01T00:00:00.000Z',
});

/** Empty: a link saved without a URL renders nothing rather than a dead icon. */
export const EmptyMissingUrl: Story = {
  args: {
    link: createLink('instagram', ''),
    handle: 'johndoe',
    artistName: 'John Doe',
  },
};

/** Error: an unsafe URL fails sanitizing, so the icon is not rendered. */
export const ErrorUnsafeUrl: Story = {
  args: {
    link: createLink('spotify', 'javascript:alert(1)'),
    handle: 'johndoe',
    artistName: 'John Doe',
  },
};

/** Long content: a long artist name only lengthens the accessible name. */
export const LongContentArtistName: Story = {
  args: {
    link: createLink('youtube', 'https://youtube.com/@longname'),
    handle: 'longname',
    artistName:
      'The Extremely Long Named Orchestra and Friends Featuring Special Guests',
  },
};

/** Right-to-left: an Arabic artist name inside an RTL profile. */
export const RtlArabicArtist: Story = {
  args: {
    link: createLink('instagram', 'https://instagram.com/amr'),
    handle: 'amr',
    artistName: 'عمرو دياب',
  },
  decorators: [RtlFrame],
};
