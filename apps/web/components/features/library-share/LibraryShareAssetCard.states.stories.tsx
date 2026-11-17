import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { LibraryShareAssetCard } from './LibraryShareAssetCard';

const ASSET = {
  id: 'item-1',
  releaseId: 'release-1',
  title: 'Never Say A Word',
  artistName: 'Tim White',
  artworkUrl: null,
  previewUrl: '/preview.mp3',
  lyrics: 'Lyrics',
  releaseType: 'single',
  releaseDate: '2026-01-15T00:00:00.000Z',
  smartLinkPath: '/tim/never-say-a-word',
  includeArtwork: true,
  includePreview: true,
  includeLyrics: true,
};

/** Rendered states of a shared press-kit asset card. */
const meta = {
  title: 'Library/LibraryShareAssetCard/States',
  component: LibraryShareAssetCard,
  parameters: { layout: 'centered' },
  args: { downloadsEnabled: true, layout: 'grid', asset: ASSET },
} satisfies Meta<typeof LibraryShareAssetCard>;

export default meta;
type Story = StoryObj<typeof meta>;

const withCardWidth: Decorator = function WithCardWidth(Story) {
  return (
    <div className='w-80'>
      <Story />
    </div>
  );
};

const withRtlDocument: Decorator = function WithRtlDocument(Story) {
  return (
    <div dir='rtl' lang='ar' className='w-80'>
      <Story />
    </div>
  );
};

/** Partial: no artwork, release date, download or lyrics. */
export const PartialNoArtwork: Story = {
  args: {
    downloadsEnabled: false,
    asset: { ...ASSET, releaseDate: null, includeLyrics: false },
  },
  decorators: [withCardWidth],
};

/** Long content: a long title truncates in the grid card. */
export const LongContentTitle: Story = {
  args: {
    asset: {
      ...ASSET,
      title:
        'Never Say A Word (Extended Club Mix featuring Every Remix From the Summer Tour)',
    },
  },
  decorators: [withCardWidth],
};

/** Right-to-left: an Arabic title in an Arabic document direction. */
export const RtlArabicTitle: Story = {
  args: { asset: { ...ASSET, title: 'منتصف الليل على الطريق' } },
  decorators: [withRtlDocument],
};
