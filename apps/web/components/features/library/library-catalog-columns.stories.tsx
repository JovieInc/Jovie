import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { buildLibraryReleaseAssets } from '@/app/app/(shell)/library/library-data';
import { LibraryCatalogArtworkCell } from './library-catalog-columns';

const [asset] = buildLibraryReleaseAssets([
  {
    profileId: 'profile-1',
    id: 'release-1',
    title: 'Take Me Over',
    artistNames: ['Tim White'],
    status: 'released',
    artworkUrl: 'https://cdn.example.com/artwork.jpg',
    slug: 'take-me-over',
    smartLinkPath: '/tim/take-me-over',
    providers: [],
    releaseType: 'single',
    isExplicit: false,
    totalTracks: 1,
    previewUrl: null,
    previewVerification: 'missing',
  },
]);

const meta = {
  title: 'Library/LibraryCatalogArtworkCell',
  component: LibraryCatalogArtworkCell,
  parameters: { layout: 'centered' },
  args: { asset: asset! },
} satisfies Meta<typeof LibraryCatalogArtworkCell>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
