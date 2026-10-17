import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fn } from 'storybook/test';
import type { Artist } from '@/types/db';
import { DataPrivacySection } from './DataPrivacySection';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false },
    mutations: { retry: false },
  },
});

const artist = {
  id: '11111111-1111-4111-8111-111111111111',
  owner_user_id: 'owner',
  handle: 'story-artist',
  spotify_id: '',
  name: 'Story Artist',
  published: true,
  is_verified: false,
  is_featured: false,
  marketing_opt_out: false,
  created_at: '2026-10-17T00:00:00Z',
} satisfies Artist;

const meta = {
  title: 'Dashboard/Organisms/DataPrivacySection',
  component: DataPrivacySection,
  args: { artist, onArtistUpdate: fn() },
  parameters: {
    layout: 'padded',
  },
  decorators: [
    Story => (
      <QueryClientProvider client={queryClient}>
        <div className='max-w-2xl'>
          <Story />
        </div>
      </QueryClientProvider>
    ),
  ],
} satisfies Meta<typeof DataPrivacySection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Unlisted: Story = {
  args: { artist: { ...artist, settings: { searchable: false } } },
};
export const WithoutSelectedProfile: Story = { args: { artist: null } };
