import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { getMarketingExportImage } from '@/lib/screenshots/registry';
import { ProductScreenshot } from './ProductScreenshot';

const image = getMarketingExportImage('dashboard-audience-desktop');

const meta = {
  title: 'Features/Home/ProductScreenshot States',
  component: ProductScreenshot,
  parameters: { layout: 'centered' },
  args: {
    src: image.publicUrl,
    alt: image.alt,
    width: 720,
    height: 450,
    skipCheck: true,
  },
} satisfies Meta<typeof ProductScreenshot>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Partial: the screenshot file is missing, so the preview fallback shows. */
export const PartialMissingImage: Story = {
  args: {
    src: '/images/missing-product-screenshot.png',
    skipCheck: false,
    title: 'Audience',
  },
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
