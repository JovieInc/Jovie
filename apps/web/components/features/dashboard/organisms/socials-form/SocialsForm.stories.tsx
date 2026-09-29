import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { queryKeys } from '@/lib/queries/keys';
import type { Artist } from '@/types/db';
import { SocialsForm } from './SocialsForm';

const artist: Artist = {
  id: 'story-profile',
  owner_user_id: 'story-user',
  handle: 'sashawaves',
  spotify_id: 'spotify-artist-1',
  name: 'Sasha Waves',
  settings: {},
  published: true,
  is_verified: false,
  is_featured: false,
  marketing_opt_out: false,
  created_at: new Date('2026-01-01T00:00:00.000Z').toISOString(),
} as Artist;

function SocialsFormQueryProvider({
  children,
}: {
  readonly children: ReactNode;
}) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity },
      mutations: { retry: false },
    },
  });
  // Seed an empty suggestions list so the story never depends on the real
  // /api/suggestions endpoint, which isn't reachable from Storybook.
  queryClient.setQueryData(queryKeys.suggestions.list(artist.id), []);
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

const meta = {
  title: 'Dashboard/Organisms/SocialsForm',
  component: SocialsForm,
  parameters: {
    layout: 'padded',
  },
  decorators: [
    Story => (
      <SocialsFormQueryProvider>
        <div className='w-2xl max-w-full'>
          <Story />
        </div>
      </SocialsFormQueryProvider>
    ),
  ],
  args: {
    artist,
  },
} satisfies Meta<typeof SocialsForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
