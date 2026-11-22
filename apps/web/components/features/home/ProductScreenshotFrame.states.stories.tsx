import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ProductScreenshotFrame } from './ProductScreenshotFrame';

const meta = {
  title: 'Features/Home/ProductScreenshotFrame/States',
  component: ProductScreenshotFrame,
  parameters: { layout: 'centered' },
  args: {
    alt: 'Release dashboard preview',
    aspectRatio: '16 / 9',
    chrome: 'window',
    height: 450,
    isAvailable: true,
    priority: false,
    src: '/images/missing-product-screenshot.png',
    title: 'Dashboard',
    width: 720,
  },
  decorators: [
    function WidthDecorator(Story) {
      return (
        <div className='w-full max-w-xl'>
          <Story />
        </div>
      );
    },
  ],
} satisfies Meta<typeof ProductScreenshotFrame>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: no screenshot exists yet, so the preview placeholder shows. */
export const EmptyUnavailable: Story = {
  args: { isAvailable: false, chrome: 'minimal' },
};

/** Error: the image failed to load and the caller flipped it to unavailable. */
export const ErrorImageFailed: Story = {
  args: { isAvailable: false, title: 'Audience' },
};

/** Partial: the window chrome frames the placeholder with its title. */
export const PartialWindowChrome: Story = {
  args: { isAvailable: false, chrome: 'window' },
};

/** Long content: a long window title truncates inside the chrome bar. */
export const LongContentTitle: Story = {
  args: {
    isAvailable: false,
    title:
      'Jovie · Audience · Every fan who tipped, listened, presaved or asked for a show alert this month',
  },
};

/** Right to left: the placeholder under an Arabic document direction. */
export const RtlOverflow: Story = {
  args: { isAvailable: false, title: 'لوحة التحكم' },
  decorators: [
    function RtlDecorator(Story) {
      return (
        <div dir='rtl' lang='ar' className='w-full max-w-xl'>
          <Story />
        </div>
      );
    },
  ],
};
