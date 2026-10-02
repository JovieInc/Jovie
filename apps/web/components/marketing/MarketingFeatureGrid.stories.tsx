import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { YOUTUBE_THUMBNAILS_COPY } from '@/data/youtubeThumbnailsCopy';
import { MarketingFeatureGrid } from './MarketingFeatureGrid';

const meta = {
  title: 'Marketing/MarketingFeatureGrid',
  component: MarketingFeatureGrid,
  args: {
    items: YOUTUBE_THUMBNAILS_COPY.safeguards.items,
  },
} satisfies Meta<typeof MarketingFeatureGrid>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Safeguards: Story = {};
