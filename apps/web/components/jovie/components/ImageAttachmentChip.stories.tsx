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

export const NoName: Story = {
  args: {
    tone: 'onLight',
  },
};

/** Empty: a chip with no file name falls back to the generic label. */
export const EmptyNoName: Story = {
  args: { tone: 'onDark' },
  parameters: { backgrounds: { default: 'dark' } },
};

/** Partial: an image that has not loaded still shows the chip shell. */
export const PartialBrokenImage: Story = {
  args: { url: 'https://example.invalid/missing.png', name: 'missing.png' },
};

/** Long content: a long file name truncates inside the chip. */
export const LongContentFileName: Story = {
  args: {
    name: 'cover-art-final-v12-with-alternate-crop-and-bleed-for-print-run.png',
    tone: 'onLight',
  },
  decorators: [
    function NarrowFrame(Story) {
      return (
        <div className='w-56'>
          <Story />
        </div>
      );
    },
  ],
};

/** Rtl: the chip mirrors in a right-to-left layout. */
export const RtlName: Story = {
  args: { name: 'غلاف-الألبوم.png', tone: 'onLight' },
  decorators: [
    function RtlFrame(Story) {
      return (
        <div dir='rtl'>
          <Story />
        </div>
      );
    },
  ],
};
