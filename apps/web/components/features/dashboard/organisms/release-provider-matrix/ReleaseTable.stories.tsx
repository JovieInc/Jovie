import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ProviderKey, ReleaseViewModel } from '@/lib/discography/types';
import { ReleaseTable } from './ReleaseTable';
import type { ProviderConfig } from './ReleaseTable.types';

const providerConfig = {
  spotify: { label: 'Spotify', accent: '#1DB954' },
  apple_music: { label: 'Apple Music', accent: '#FA243C' },
} as Record<ProviderKey, ProviderConfig>;

const releases: ReleaseViewModel[] = [
  {
    profileId: 'profile_1',
    id: 'rel_1',
    title: 'Seaside Heights',
    artistNames: ['Tim White'],
    releaseDate: '2026-08-01',
    status: 'released',
    slug: 'seaside-heights',
    smartLinkPath: '/seaside-heights',
    providers: [
      {
        key: 'spotify',
        url: 'https://open.spotify.com/album/abc',
        source: 'ingested',
        updatedAt: '2026-08-01T00:00:00.000Z',
        label: 'Spotify',
        path: 'https://open.spotify.com/album/abc',
        isPrimary: true,
      },
    ],
    releaseType: 'single',
    isExplicit: false,
    totalTracks: 1,
  } as ReleaseViewModel,
];

const meta: Meta<typeof ReleaseTable> = {
  title: 'Dashboard/Releases/ReleaseTable',
  component: ReleaseTable,
  parameters: {
    layout: 'fullscreen',
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    releases,
    providerConfig,
    artistName: 'Tim White',
    onCopy: async () => 'copied',
    onEdit: () => undefined,
    onDelete: () => undefined,
  },
};

export const Empty: Story = {
  args: {
    releases: [],
    providerConfig,
    artistName: 'Tim White',
    onCopy: async () => 'copied',
    onEdit: () => undefined,
  },
};
