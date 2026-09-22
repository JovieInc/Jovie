import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ProviderKey, ReleaseViewModel } from '@/lib/discography/types';
import type { ProviderConfig } from './ReleaseTable.types';
import { ReleaseTableWithTracks } from './ReleaseTableWithTracks';

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
    providers: [],
    releaseType: 'album',
    isExplicit: false,
    totalTracks: 3,
  } as ReleaseViewModel,
];

const meta: Meta<typeof ReleaseTableWithTracks> = {
  title: 'Dashboard/Releases/ReleaseTableWithTracks',
  component: ReleaseTableWithTracks,
  parameters: {
    layout: 'fullscreen',
    // `isLoading` is derived internally (isSorting && isLargeDataset), not a prop.
    jovie: { uncoveredProps: ['isLoading'] },
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
