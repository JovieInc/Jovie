import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HttpResponse, http } from 'msw';
import { fn } from 'storybook/test';
import type { Artist } from '@/types/db';
import { SettingsSearchabilitySection } from './SettingsSearchabilitySection';

const artist = {
  id: '11111111-1111-4111-8111-111111111111',
  owner_user_id: 'owner-fixture',
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
  title: 'Dashboard/Organisms/SettingsSearchabilitySection',
  component: SettingsSearchabilitySection,
  parameters: {
    layout: 'padded',
    msw: {
      handlers: [
        http.put('/api/dashboard/profile', () =>
          HttpResponse.json({ success: true })
        ),
      ],
    },
  },
  args: { artist, onArtistUpdate: fn() },
  decorators: [
    Story => (
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { mutations: { retry: false } } })
        }
      >
        <div className='max-w-2xl'>
          <Story />
        </div>
      </QueryClientProvider>
    ),
  ],
} satisfies Meta<typeof SettingsSearchabilitySection>;
export default meta;
type Story = StoryObj<typeof meta>;

export const LegacyChoice: Story = {};
export const Searchable: Story = {
  args: { artist: { ...artist, settings: { searchable: true } } },
};
export const Unlisted: Story = {
  args: { artist: { ...artist, settings: { searchable: false } } },
};
export const PrivateProfile: Story = {
  args: {
    artist: { ...artist, published: false, settings: { searchable: false } },
  },
};
export const SaveFailure: Story = {
  parameters: {
    msw: {
      handlers: [
        http.put('/api/dashboard/profile', () =>
          HttpResponse.json({ error: 'Unavailable' }, { status: 503 })
        ),
      ],
    },
  },
};
