import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ReactNode } from 'react';
import { ScreenshotGallery } from './ScreenshotGallery';
import { makeScreenshot, SCREENSHOT_SET } from './ScreenshotGallery.fixtures';

function WidthDecorator(Story: () => ReactNode) {
  return (
    <div className='w-full max-w-6xl'>
      <Story />
    </div>
  );
}

const meta = {
  title: 'Features/Admin/ScreenshotGallery/States',
  component: ScreenshotGallery,
  parameters: { layout: 'centered' },
  decorators: [WidthDecorator],
} satisfies Meta<typeof ScreenshotGallery>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: no captures at all, so the empty message shows. */
export const EmptyNoCaptures: Story = {
  args: { screenshots: [] },
};

/** Long content: very long titles and labels truncate inside the cards. */
export const LongContentTitles: Story = {
  args: {
    screenshots: [
      makeScreenshot({
        title:
          'Homepage desktop capture with an extremely long title that has to truncate inside its card',
        groupLabel: 'A very long capture group label for the marketing export',
      }),
    ],
  },
};

/** RTL: the grid and filter pills mirror in a right-to-left document. */
export const RtlGallery: Story = {
  args: { screenshots: SCREENSHOT_SET },
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
