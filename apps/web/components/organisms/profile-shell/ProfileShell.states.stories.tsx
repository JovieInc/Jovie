import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ReactNode } from 'react';
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

function RtlFrame(Story: () => ReactNode) {
  return (
    <div dir='rtl'>
      <Story />
    </div>
  );
}

/**
 * State coverage for the public profile shell. The canonical stories stay in
 * ProfileShell.stories.tsx; these use the same artist and links and change
 * what the profile has, how long its copy runs and the document direction.
 */
const meta = {
  title: 'Organisms/ProfileShell/ProfileShell States',
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

/** Empty: no social links, contacts or content, and no mode bar. */
export const EmptyProfile: Story = {
  args: {
    socialLinks: [],
    contacts: [],
    showSocialBar: false,
    children: null,
  },
};

/** Long content: a long artist name and tagline wrap above the content. */
export const LongContentArtist: Story = {
  args: {
    artist: {
      ...mockArtist,
      name: 'The Extraordinarily Long Named Orchestra and Choir of the Northern Hemisphere',
      tagline:
        'Independent collective recording live in kitchens, basements and empty train stations across three continents since 2009',
    } as Artist,
    subtitle:
      'Touring every weekend through the end of the year with a different guest vocalist in each city',
  },
};

/** Right-to-left: the shell inside an RTL document. */
export const RtlDocument: Story = {
  args: {
    artist: {
      ...mockArtist,
      name: 'عمرو دياب',
      tagline: 'فنان مستقل',
    } as Artist,
  },
  decorators: [RtlFrame],
};
