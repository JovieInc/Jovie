import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ImageAttachmentChip } from './ImageAttachmentChip';

const meta = {
  title: 'Jovie/ImageAttachmentChip',
  component: ImageAttachmentChip,
  parameters: {
    layout: 'centered',
  },
  args: {
    url: 'https://placehold.co/480x480/111827/f5f5f5?text=Cover',
  },
} satisfies Meta<typeof ImageAttachmentChip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const OnLight: Story = {
  args: {
    name: 'cover-art-final.png',
    tone: 'onLight',
  },
};

export const OnDark: Story = {
  args: {
    name: 'cover-art-final.png',
    tone: 'onDark',
  },
  parameters: {
    backgrounds: { default: 'dark' },
  },
};

/** Empty: no filename, so the chip falls back to the generic Image label. */
export const EmptyNoFilename: Story = {
  args: {
    tone: 'onLight',
  },
};

/** Partial: short stem with no extension cue in the label. */
export const PartialShortName: Story = {
  args: {
    name: 'a.png',
    tone: 'onLight',
  },
};

/** Long content: a long filename that truncates in the chip row. */
export const LongContentFilename: Story = {
  args: {
    name: 'final-album-cover-art-for-international-tour-deluxe-edition-master.png',
    tone: 'onLight',
  },
};

/** RTL overflow: long Arabic filename in a narrow RTL frame. */
export const RtlOverflowFilename: Story = {
  decorators: [
    Story => (
      <div dir='rtl' className='w-40'>
        <Story />
      </div>
    ),
  ],
  args: {
    name: 'غلاف-الألبوم-النهائي-للجولة-الدولية-الطبعة-الخاصة.png',
    tone: 'onLight',
  },
};
