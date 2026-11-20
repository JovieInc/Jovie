import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { StatefulAssetSlot } from './StatefulAssetSlot';

/** Rendered states of the inspector asset slot. */
const meta = {
  title: 'Library/StatefulAssetSlot/States',
  component: StatefulAssetSlot,
  args: {
    kind: 'artwork',
    occupancy: 'populated',
    cardinality: 'single',
    acquireMode: 'file',
    testIdPrefix: 'library-artwork',
    objectTitle: 'Artwork attached',
    acquireLabel: 'Drop artwork',
    accept: 'image/jpeg',
    disabled: false,
    onFile: () => undefined,
  },
} satisfies Meta<typeof StatefulAssetSlot>;

export default meta;
type Story = StoryObj<typeof meta>;

const withPanelWidth: Decorator = function WithPanelWidth(Story) {
  return (
    <div className='w-72'>
      <Story />
    </div>
  );
};

const withRtlDocument: Decorator = function WithRtlDocument(Story) {
  return (
    <div dir='rtl' lang='ar' className='w-72'>
      <Story />
    </div>
  );
};

/** Partial: an attached file with no preview image or subtitle yet. */
export const PartialNoPreview: Story = {
  args: { previewSrc: null },
  decorators: [withPanelWidth],
};

/** Long content: a long file title truncates and a long subtitle wraps. */
export const LongContentTitle: Story = {
  args: {
    kind: 'docs',
    objectTitle:
      'Midnight Drive final press release with every quote, credit and approved photo caption.pdf',
    objectSubtitle:
      'Uploaded by the label for the summer campaign, last edited before the release-day embargo lifted',
  },
  decorators: [withPanelWidth],
};

/** Right-to-left: an Arabic title in an Arabic document direction. */
export const RtlArabicTitle: Story = {
  args: {
    kind: 'docs',
    objectTitle: 'ملف العمل الفني النهائي',
    objectSubtitle: 'نسخة معتمدة',
  },
  decorators: [withRtlDocument],
};
