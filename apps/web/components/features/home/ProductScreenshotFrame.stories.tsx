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

export const Default: Story = {};
