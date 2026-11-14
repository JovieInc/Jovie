import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { Artist } from '@/types/db';
import { ArtistInfo } from './ArtistInfo';

const artist: Artist = {
  id: '1',
  handle: 'taylorswift',
  name: 'Taylor Swift',
  image_url:
    'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=400&h=400&fit=crop&crop=face',
  tagline: 'Singer-songwriter.',
  is_verified: true,
  owner_user_id: '1',
  spotify_id: '',
  published: true,
  is_featured: false,
  created_at: '2026-01-01T00:00:00.000Z',
  marketing_opt_out: false,
};

/** Rendered states of the profile header, beside ArtistInfo.stories.tsx. */
const meta: Meta<typeof ArtistInfo> = {
  title: 'Molecules/ArtistInfo States',
  component: ArtistInfo,
  parameters: {
    layout: 'centered',
  },
  args: {
    artist,
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

/** Partial: no photo and no tagline, so the initials and default tagline show. */
export const PartialNoPhotoOrTagline: Story = {
  args: {
    artist: {
      ...artist,
      image_url: undefined,
      tagline: undefined,
      is_verified: false,
    },
  },
};

/** Right-to-left: an Arabic name and tagline in the split layout. */
export const RtlArabicSplit: Story = {
  args: {
    bodyLayout: 'split',
    artist: {
      ...artist,
      name: 'فيروز',
      handle: 'fairuz',
      tagline: 'مغنية لبنانية وأيقونة الموسيقى العربية.',
    },
  },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar' className='w-full max-w-xl'>
        <Story />
      </div>
    ),
  ],
};
