import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Artist } from '@/types/db';
import { ArtistInfo } from './ArtistInfo';

const meta: Meta<typeof ArtistInfo> = {
  title: 'Molecules/ArtistInfo',
  component: ArtistInfo,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    avatarSize: {
      control: { type: 'select' },
      options: ['sm', 'md', 'lg', 'xl', '2xl'],
    },
    nameSize: {
      control: { type: 'select' },
      options: ['sm', 'md', 'lg', 'xl'],
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

const mockArtist: Artist = {
  id: '1',
  handle: 'taylorswift',
  name: 'Taylor Swift',
  image_url:
    'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=400&h=400&fit=crop&crop=face',
  tagline:
    'Grammy Award-winning singer-songwriter known for narrative songs about her personal life.',
  is_verified: true,
  owner_user_id: '1',
  spotify_id: '',
  published: true,
  is_featured: false,
  created_at: new Date().toISOString(),
  marketing_opt_out: false,
};

export const Default: Story = {
  args: {
    artist: mockArtist,
  },
};

export const Verified: Story = {
  args: {
    artist: { ...mockArtist, is_verified: true },
  },
};

export const Unverified: Story = {
  args: {
    artist: { ...mockArtist, is_verified: false },
  },
};

export const WithSubtitle: Story = {
  args: {
    artist: mockArtist,
    subtitle: 'Live at Madison Square Garden 2024',
  },
};

export const SmallAvatar: Story = {
  args: {
    artist: mockArtist,
    avatarSize: 'sm',
    nameSize: 'sm',
  },
};

export const LargeAvatar: Story = {
  args: {
    artist: mockArtist,
    avatarSize: 'xl',
    nameSize: 'xl',
  },
};

export const LongTagline: Story = {
  args: {
    artist: {
      ...mockArtist,
      tagline:
        'Multi-platinum recording artist, songwriter, and performer with over 200 million records sold worldwide. Known for her storytelling through music and her massive cultural impact.',
    },
  },
};

export const NewArtist: Story = {
  args: {
    artist: {
      ...mockArtist,
      name: 'Rising Star',
      handle: 'risingstar',
      is_verified: false,
      tagline: undefined, // Will use default tagline
    },
  },
};

export const InDarkMode: Story = {
  args: {
    artist: mockArtist,
  },
  parameters: {
    backgrounds: { default: 'dark' },
  },
};
