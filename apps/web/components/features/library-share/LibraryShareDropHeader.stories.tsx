import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import type { LibraryShareDropAsset } from '@/lib/library-share/types';
import { LibraryShareDropHeader } from './LibraryShareDropHeader';

const ASSET = {
  id: 'item-1',
  releaseId: 'release-1',
  title: 'Midnight Drive',
  artistName: 'Tim White',
  artworkUrl: null,
  previewUrl: null,
  lyrics: null,
  releaseType: 'single',
  releaseDate: '2026-01-15T00:00:00.000Z',
  smartLinkPath: '/tim/midnight-drive',
  includeArtwork: true,
  includePreview: false,
  includeLyrics: false,
} satisfies LibraryShareDropAsset;

const VIEW = {
  title: 'Midnight Drive press kit',
  message: 'Artwork, previews and lyrics for the single.',
  artistName: 'Tim White',
  artistAvatarUrl: null,
  logoUrl: null,
  accentColor: null,
  assets: [ASSET, { ...ASSET, id: 'item-2', title: 'Night Swim' }],
};

const withRtlDocument: Decorator = function WithRtlDocument(Story) {
  return (
    <div dir='rtl' lang='ar'>
      <Story />
    </div>
  );
};

const meta = {
  title: 'Library/LibraryShareDropHeader',
  component: LibraryShareDropHeader,
  parameters: { layout: 'fullscreen' },
  args: { view: VIEW },
} satisfies Meta<typeof LibraryShareDropHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A press kit with a message and two assets. */
export const Default: Story = {};

/** Empty: a press kit with no assets yet. */
export const EmptyNoAssets: Story = {
  args: { view: { ...VIEW, message: null, assets: [] } },
};

/** Long content: a long title truncates and a long message wraps. */
export const LongContentTitleAndMessage: Story = {
  args: {
    view: {
      ...VIEW,
      title:
        'Midnight Drive press kit with every remix, stem, lyric sheet and tour photo for the summer campaign',
      message:
        'Everything a writer, playlist curator or promoter needs for the release: artwork in every size, previews of each mix, lyrics and approved photos. Download what you need and reach out for interviews.',
    },
  },
};

/** Right-to-left: Arabic copy in an Arabic document direction. */
export const RtlArabic: Story = {
  args: {
    view: {
      ...VIEW,
      title: 'ملف صحفي لمنتصف الليل',
      message: 'الصور والمعاينات وكلمات الأغنية.',
    },
  },
  decorators: [withRtlDocument],
};
