import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { ImagePreviewStrip } from './ImagePreviewStrip';

const png =
  'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="%23888"/></svg>';

function image(id: string, name: string) {
  return {
    id,
    name,
    mediaType: 'image/svg+xml',
    previewUrl: png,
    dataUrl: png,
  };
}

const meta = {
  title: 'Jovie/Components/ImagePreviewStrip',
  component: ImagePreviewStrip,
  parameters: { layout: 'centered' },
  decorators: [
    function StripFrame(Story) {
      return (
        <div className='w-full max-w-md'>
          <Story />
        </div>
      );
    },
  ],
  args: {
    images: [image('1', 'cover.png'), image('2', 'press-shot.png')],
    onRemove: fn(),
  },
} satisfies Meta<typeof ImagePreviewStrip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** Empty: no attachments, so nothing is rendered. */
export const EmptyNoImages: Story = { args: { images: [] } };

/** Long content: many images with long names scroll horizontally. */
export const LongContentScrolling: Story = {
  args: {
    images: Array.from({ length: 8 }, (_, index) =>
      image(
        String(index),
        `a-very-long-press-photo-file-name-from-the-release-shoot-${index}.png`
      )
    ),
  },
};

/** Rtl: the strip flows from the inline start in a right-to-left layout. */
export const RtlStrip: Story = {
  args: { images: [image('1', 'غلاف.png'), image('2', 'صورة.png')] },
  decorators: [
    function RtlFrame(Story) {
      return (
        <div dir='rtl' className='w-full max-w-md'>
          <Story />
        </div>
      );
    },
  ],
};
