import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ScreenshotGallerySkeleton } from '@/app/app/(shell)/admin/screenshots/ScreenshotGallerySkeleton';

const meta: Meta<typeof ScreenshotGallerySkeleton> = {
  title: 'Admin/Content Detail/ScreenshotGallerySkeleton',
  component: ScreenshotGallerySkeleton,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Desktop: Story = {};

export const Mobile: Story = {
  parameters: { viewport: { defaultViewport: 'mobile1' } },
};
