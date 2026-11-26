import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ReactNode } from 'react';
import { ScreenshotCard } from './ScreenshotCard';
import { makeScreenshot } from './ScreenshotGallery.fixtures';

function WidthDecorator(Story: () => ReactNode) {
  return (
    <div className='w-full max-w-sm'>
      <Story />
    </div>
  );
}

const meta = {
  title: 'Features/Admin/ScreenshotGallery/ScreenshotCard',
  component: ScreenshotCard,
  parameters: { layout: 'centered' },
  decorators: [WidthDecorator],
  args: { screenshot: makeScreenshot(), onOpen: () => undefined },
} satisfies Meta<typeof ScreenshotCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** Loading: the preview image is lazy, so its aspect box holds the space. */
export const LoadingPreview: Story = {};

/** Empty: a capture with no canonical surface, commit or export link. */
export const EmptyMetadata: Story = {
  args: {
    screenshot: makeScreenshot({
      canonicalSurfaceLabel: undefined,
      publicUrl: undefined,
      gitSha: null,
      consumers: [],
    }),
  },
};

/** Long content: a long title truncates and the chips wrap. */
export const LongContentTitle: Story = {
  args: {
    screenshot: makeScreenshot({
      title:
        'Homepage desktop capture with an extremely long title that has to truncate',
      consumers: ['marketing-export', 'investor-ready'],
    }),
  },
};

/** Offline: the lazy preview cannot load, the alt text and download link remain. */
export const OfflinePreview: Story = {
  args: { screenshot: makeScreenshot({ url: '/offline-missing.png' }) },
};

/** RTL: the card mirrors in a right-to-left document. */
export const RtlCard: Story = {
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
