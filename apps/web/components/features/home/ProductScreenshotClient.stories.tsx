import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { getMarketingExportImage } from '@/lib/screenshots/registry';
import { ProductScreenshotClient } from './ProductScreenshotClient';

const image = getMarketingExportImage('dashboard-audience-desktop');

const meta = {
  title: 'Features/Home/ProductScreenshotClient',
  component: ProductScreenshotClient,
  parameters: { layout: 'centered' },
  args: {
    alt: image.alt,
    aspectRatio: '720 / 450',
    chrome: 'window',
    height: 450,
    priority: false,
    src: image.publicUrl,
    title: 'Jovie',
    width: 720,
  },
} satisfies Meta<typeof ProductScreenshotClient>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** Partial: the screenshot file is missing, so the preview fallback shows. */
export const PartialMissingImage: Story = {
  args: { src: '/images/missing-product-screenshot.png', title: 'Audience' },
};

/** Long content: a long window title in the chrome bar. */
export const LongContentTitle: Story = {
  args: {
    title:
      'Jovie · Audience · Every fan who tipped, listened, presaved or asked for a show alert this month',
  },
};

/** Rtl: an Arabic window title in a right-to-left document. */
export const Rtl: Story = {
  args: { title: 'جوفي · الجمهور' },
  decorators: [
    function RtlDecorator(Story) {
      return (
        <div dir='rtl' lang='ar'>
          <Story />
        </div>
      );
    },
  ],
};
