import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ProductScreenshotFrame } from './ProductScreenshotFrame';

const meta = {
  title: 'Features/Home/ProductScreenshotFrame',
  component: ProductScreenshotFrame,
  parameters: {
    layout: 'centered',
    jovie: {
      uncoveredProps: [
        'alt',
        'aspectRatio',
        'chrome',
        'height',
        'isAvailable',
        'priority',
        'src',
        'title',
        'width',
      ],
    },
  },
} satisfies Meta<typeof ProductScreenshotFrame>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    alt: 'Jovie dashboard screenshot',
    aspectRatio: '16 / 9',
    chrome: 'window',
    height: 720,
    isAvailable: true,
    priority: false,
    src: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=1280&h=720&fit=crop',
    title: 'Dashboard overview',
    width: 1280,
  },
};
