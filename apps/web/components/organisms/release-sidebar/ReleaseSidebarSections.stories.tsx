import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ProviderKey } from '@/lib/discography/types';
import { ReleaseEntityHeader } from './ReleaseSidebarSections';
import type { Release } from './types';

const mockRelease = {
  id: 'rel_1',
  title: 'Midnight Drive',
  artistNames: ['Example Artist'],
  releaseType: 'single',
  releaseDate: '2026-01-15',
  totalTracks: 1,
  artworkUrl: 'https://placehold.co/400x400',
  links: [],
  providers: [],
} as unknown as Release;

const providerConfig = {} as Record<
  ProviderKey,
  { label: string; accent: string }
>;

const meta = {
  title: 'Organisms/ReleaseSidebar/ReleaseSidebarSections',
  component: ReleaseEntityHeader,
  parameters: {
    layout: 'centered',
    jovie: {
      uncoveredProps: ['disabled'],
    },
  },
} satisfies Meta<typeof ReleaseEntityHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const EntityHeader: Story = {
  args: {
    release: mockRelease,
    artistName: 'Example Artist',
    providerConfig,
    canUploadArtwork: false,
    canRevertArtwork: false,
    onArtworkUpload: undefined,
    onArtworkRevert: undefined,
    allowDownloads: false,
    previewUrl: null,
    isPlaying: false,
    onTogglePreview: () => undefined,
  },
};
