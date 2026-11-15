import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { LibraryShareDropPublicView } from '@/lib/library-share/types';
import { LibraryShareDropSurface } from './LibraryShareDropSurface';
import { WEB171_DROP_VIEW } from './LibraryShareDropSurface.stories';

const asset = WEB171_DROP_VIEW.assets[0]!;

const longView: LibraryShareDropPublicView = {
  ...WEB171_DROP_VIEW,
  title:
    'The complete press kit for the extended sunrise mix, with every stem, lyric sheet and artwork variant',
  message:
    'Everything for the label review is here: artwork in every size, the radio edit and the extended mix, plus lyric sheets for the whole record.',
  layout: 'list',
  assets: Array.from({ length: 6 }, (_, index) => ({
    ...asset,
    id: `${asset.id}-${index}`,
    title: `${asset.title} (Extended Sunrise Mix featuring the Whole Band, Part ${index + 1})`,
  })),
};

const rtlView: LibraryShareDropPublicView = {
  ...WEB171_DROP_VIEW,
  title: 'مجموعة الصحافة',
  message: 'كل ما تحتاجه لمراجعة الإصدار',
  assets: [{ ...asset, title: 'النهاية العميقة' }],
};

const meta = {
  title: 'Public/Routes/LibraryShareDrop States',
  component: LibraryShareDropSurface,
  parameters: { layout: 'fullscreen' },
  args: { view: WEB171_DROP_VIEW, initialUnlocked: true },
} satisfies Meta<typeof LibraryShareDropSurface>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Long content: a long title, message and many long asset titles. */
export const LongContent: Story = {
  args: { view: longView },
};

/** Rtl: an Arabic drop in a right-to-left document. */
export const Rtl: Story = {
  args: { view: rtlView },
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
