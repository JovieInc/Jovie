import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ReactNode } from 'react';
import { makeScreenshot } from './ScreenshotGallery.fixtures';
import { ScreenshotLightbox } from './ScreenshotLightbox';

const noop = () => undefined;

const meta = {
  title: 'Features/Admin/ScreenshotGallery/ScreenshotLightbox',
  component: ScreenshotLightbox,
  parameters: { layout: 'fullscreen' },
  args: {
    open: true,
    selected: makeScreenshot(),
    index: 1,
    count: 3,
    onClose: noop,
    onPrevious: noop,
    onNext: noop,
  },
} satisfies Meta<typeof ScreenshotLightbox>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** Empty: open with no capture selected, so only the title shows. */
export const EmptySelection: Story = {
  args: { selected: null, index: null, count: 0 },
};

/** Long content: a long title truncates in the header. */
export const LongContentTitle: Story = {
  args: {
    selected: makeScreenshot({
      title:
        'Homepage desktop capture with an extremely long title that has to truncate in the header',
    }),
  },
};

/** RTL: the controls mirror in a right-to-left document. */
export const RtlLightbox: Story = {
  decorators: [
    function RtlDecorator(Story: () => ReactNode) {
      return (
        <div dir='rtl'>
          <Story />
        </div>
      );
    },
  ],
};
