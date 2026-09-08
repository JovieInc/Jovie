import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { Artist } from '@/types/db';
import { ListenNowForm } from './ListenNowForm';

const storyArtist = {
  id: 'story-listen-now',
  owner_user_id: 'story-user',
  handle: 'story-artist',
  spotify_id: '',
  name: 'Mina Vale',
  tagline: 'Independent producer and vocalist',
  image_url: '',
  spotify_url: 'https://open.spotify.com/artist/story',
  apple_music_url: '',
  youtube_url: 'https://youtube.com/@minavale',
  settings: {},
  published: true,
  is_verified: true,
  is_featured: false,
  marketing_opt_out: false,
  created_at: '2026-01-01T00:00:00.000Z',
} satisfies Artist;

const meta = {
  title: 'Dashboard/Organisms/ListenNowForm',
  component: ListenNowForm,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <div className='w-full max-w-2xl'>
        <Story />
      </div>
    ),
  ],
  args: {
    artist: storyArtist,
    onUpdate: () => undefined,
  },
} satisfies Meta<typeof ListenNowForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
