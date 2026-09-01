import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { Artist } from '@/types/db';
import { ProfileForm } from './ProfileForm';

const storyArtist = {
  id: 'story-artist',
  owner_user_id: 'story-user',
  handle: 'story-artist',
  spotify_id: '',
  name: 'Mina Vale',
  tagline: 'Independent producer and vocalist',
  image_url: '',
  spotify_url: '',
  apple_music_url: '',
  youtube_url: '',
  settings: {},
  published: true,
  is_verified: true,
  is_featured: false,
  marketing_opt_out: false,
  created_at: '2026-01-01T00:00:00.000Z',
} satisfies Artist;

const meta = {
  title: 'Dashboard/Organisms/ProfileForm',
  component: ProfileForm,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <div className='w-[24rem] max-w-[90vw]'>
        <Story />
      </div>
    ),
  ],
  args: {
    artist: storyArtist,
    onUpdate: () => undefined,
  },
} satisfies Meta<typeof ProfileForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
