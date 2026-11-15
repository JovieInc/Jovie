import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { LibraryShareDropAsset } from '@/lib/library-share/types';
import { getMarketingExportImage } from '@/lib/screenshots/registry';
import { LibraryShareAssetLayouts } from './LibraryShareAssetLayouts';

const artwork = getMarketingExportImage('tim-white-profile-live-mobile');

const base: LibraryShareDropAsset = {
  id: 'asset-1',
  releaseId: 'release-1',
  title: 'The Deep End',
  artistName: 'Tim White',
  artworkUrl: artwork.publicUrl,
  previewUrl: null,
  lyrics: null,
  releaseType: 'single',
  releaseDate: '2026-06-01',
  smartLinkPath: '/tim/the-deep-end',
  includeArtwork: true,
  includePreview: false,
  includeLyrics: false,
};

const meta = {
  title: 'Features/LibraryShare/LibraryShareAssetLayouts States',
  component: LibraryShareAssetLayouts,
  parameters: { layout: 'fullscreen' },
  args: { assets: [base], layout: 'grid', downloadsEnabled: true },
} satisfies Meta<typeof LibraryShareAssetLayouts>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Long content: many assets with long titles in the list layout. */
export const LongContent: Story = {
  args: {
    layout: 'list',
    assets: Array.from({ length: 8 }, (_, index) => ({
      ...base,
      id: `asset-${index + 1}`,
      releaseId: `release-${index + 1}`,
      title: `The Deep End (Extended Sunrise Mix featuring the Whole Band, Part ${index + 1})`,
      artistName: 'Tim White and the Late Night Los Angeles Orchestra',
    })),
  },
};

/** Rtl: Arabic titles in a right-to-left document. */
export const Rtl: Story = {
  args: {
    assets: [
      { ...base, title: 'النهاية العميقة', artistName: 'تيم وايت' },
      {
        ...base,
        id: 'asset-2',
        releaseId: 'release-2',
        title: 'إشارات',
        artistName: 'تيم وايت',
      },
    ],
  },
  decorators: [
    function RtlDecorator(Story) {
      return (
        <div dir='rtl' lang='ar'>
          <Story />
        </div>
      );
    },
  ],
};
