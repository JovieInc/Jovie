import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ReactNode } from 'react';
import { ScreenshotGallery } from './ScreenshotGallery';
import { SCREENSHOT_SET } from './ScreenshotGallery.fixtures';

function WidthDecorator(Story: () => ReactNode) {
  return (
    <div className='w-full max-w-6xl'>
      <Story />
    </div>
  );
}

const meta = {
  title: 'Features/Admin/ScreenshotGallery',
  component: ScreenshotGallery,
  parameters: { layout: 'centered' },
  decorators: [WidthDecorator],
} satisfies Meta<typeof ScreenshotGallery>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { screenshots: SCREENSHOT_SET },
};
