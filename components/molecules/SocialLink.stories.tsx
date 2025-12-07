import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { LegacySocialLink } from '@/types/db';
import { SocialLink } from './SocialLink';

const meta: Meta<typeof SocialLink> = {
  title: 'Molecules/SocialLink',
  component: SocialLink,
  parameters: {
    layout: 'centered',
  },
};

export default meta;
type Story = StoryObj<typeof SocialLink>;

const createLink = (platform: string, url: string): LegacySocialLink => ({
  id: `link-${platform}`,
  platform,
  url,
  creator_profile_id: 'profile-1',
  sort_order: 0,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
});

export const Spotify: Story = {
  args: {
    link: createLink('spotify', 'https://open.spotify.com/artist/johndoe'),
    handle: 'johndoe',
    artistName: 'John Doe',
  },
};

export const Instagram: Story = {
  args: {
    link: createLink('instagram', 'https://instagram.com/johndoe'),
    handle: 'johndoe',
    artistName: 'John Doe',
  },
};

export const Twitter: Story = {
  args: {
    link: createLink('twitter', 'https://twitter.com/johndoe'),
    handle: 'johndoe',
    artistName: 'John Doe',
  },
};

export const YouTube: Story = {
  args: {
    link: createLink('youtube', 'https://youtube.com/@johndoe'),
    handle: 'johndoe',
    artistName: 'John Doe',
  },
};

export const TikTok: Story = {
  args: {
    link: createLink('tiktok', 'https://tiktok.com/@johndoe'),
    handle: 'johndoe',
    artistName: 'John Doe',
  },
};

export const SocialBar: Story = {
  render: () => (
    <div className='flex gap-2'>
      <SocialLink
        link={createLink('spotify', 'https://open.spotify.com/artist/johndoe')}
        handle='johndoe'
        artistName='John Doe'
      />
      <SocialLink
        link={createLink('instagram', 'https://instagram.com/johndoe')}
        handle='johndoe'
        artistName='John Doe'
      />
      <SocialLink
        link={createLink('twitter', 'https://twitter.com/johndoe')}
        handle='johndoe'
        artistName='John Doe'
      />
      <SocialLink
        link={createLink('youtube', 'https://youtube.com/@johndoe')}
        handle='johndoe'
        artistName='John Doe'
      />
      <SocialLink
        link={createLink('tiktok', 'https://tiktok.com/@johndoe')}
        handle='johndoe'
        artistName='John Doe'
      />
    </div>
  ),
};
