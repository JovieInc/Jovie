import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { DashboardSocialLink } from '@/lib/queries';
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

const LINKS: DashboardSocialLink[] = [
  { id: 'l1', platform: 'instagram', url: 'https://instagram.com/sashawaves' },
  { id: 'l2', platform: 'tiktok', url: 'https://tiktok.com/@sashawaves' },
];

const LONG_LINKS: DashboardSocialLink[] = [
  {
    id: 'l3',
    platform: 'youtube',
    url: 'https://www.youtube.com/@a-channel-with-an-extremely-long-handle-that-keeps-going-and-going-and-going',
  },
];

function SeededProvider({
  children,
  links,
}: {
  readonly children: ReactNode;
  readonly links: DashboardSocialLink[];
}) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity },
      mutations: { retry: false },
    },
  });
  queryClient.setQueryData(queryKeys.suggestions.list(artist.id), []);
  queryClient.setQueryData(queryKeys.dashboard.socialLinks(artist.id), links);
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

function withLinks(links: DashboardSocialLink[], dir: 'ltr' | 'rtl' = 'ltr') {
  return function LinksDecorator(Story: () => ReactNode) {
    return (
      <SeededProvider links={links}>
        <div dir={dir} className='w-2xl max-w-full'>
          <Story />
        </div>
      </SeededProvider>
    );
  };
}

const meta = {
  title: 'Dashboard/Organisms/SocialsForm/SocialsForm States',
  component: SocialsForm,
  parameters: { layout: 'padded' },
  args: { artist },
} satisfies Meta<typeof SocialsForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Partial: Story = { decorators: [withLinks(LINKS)] };

export const Empty: Story = { decorators: [withLinks([])] };

export const LongContent: Story = { decorators: [withLinks(LONG_LINKS)] };

export const Rtl: Story = { decorators: [withLinks(LINKS, 'rtl')] };
