import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { Artist, LegacySocialLink } from '@/types/db';
import { ProfileShell } from './ProfileShell';

const mockArtist = {
  id: 'artist-1',
  owner_user_id: 'user-1',
  handle: 'tim',
  name: 'Tim White',
  image_url: 'https://placehold.co/400x400',
  tagline: 'Independent artist',
  published: true,
  is_verified: true,
  is_featured: false,
  marketing_opt_out: false,
  created_at: '2026-01-01T00:00:00.000Z',
} as unknown as Artist;

const socialLinks: LegacySocialLink[] = [
  {
    id: 'l1',
    artist_id: 'artist-1',
    platform: 'instagram',
    url: 'https://instagram.com/tim',
    clicks: 0,
    created_at: '2026-01-01T00:00:00.000Z',
  },
];

const meta = {
  title: 'Organisms/ProfileShell/ProfileShell',
  component: ProfileShell,
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    artist: mockArtist,
    socialLinks,
    children: (
      <div className='rounded-lg border border-subtle bg-surface-0 p-4 text-center text-sm text-secondary-token'>
        Profile content
      </div>
    ),
  },
} satisfies Meta<typeof ProfileShell>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithBackButton: Story = {
  args: {
    showBackButton: true,
    mode: 'listen',
  },
};

export const WithPayButton: Story = {
  args: {
    showPayButton: true,
  },
};

export const NoSocialBar: Story = {
  args: {
    showSocialBar: false,
  },
};
