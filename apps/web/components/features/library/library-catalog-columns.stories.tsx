import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { buildLibraryReleaseAssets } from '@/app/app/(shell)/library/library-data';
import { buildLibraryTakeAssets } from '@/app/app/(shell)/library/library-take-assets';
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

const [take] = buildLibraryTakeAssets(
  [
    {
      takeId: 'take-1',
      takeNumber: 3,
      title: 'Release day shout-out',
      kind: 'promo',
      source: 'script',
      durationMs: 42_000,
      kept: true,
      createdAt: '2026-11-11T12:00:00.000Z',
      mediaUrl: '/api/teleprompter/takes/take-1/media',
    },
  ],
  'Tim White'
);

const meta = {
  title: 'Library/LibraryCatalogArtworkCell',
  component: LibraryCatalogArtworkCell,
  parameters: { layout: 'centered' },
  args: { asset: asset! },
} satisfies Meta<typeof LibraryCatalogArtworkCell>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** A private studio take in Work: a video with no artwork. */
export const StudioTake: Story = { args: { asset: take! } };
