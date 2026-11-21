import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { OptimizedImage } from './OptimizedImage';

const meta = {
  title: 'Molecules/OptimizedImage/States',
  component: OptimizedImage,
  parameters: { layout: 'centered' },
  args: { alt: 'Artist performing', size: 'lg', shape: 'rounded' },
} satisfies Meta<typeof OptimizedImage>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Loading: the shimmer skeleton shows until the image resolves. */
export const LoadingSkeleton: Story = {
  args: { src: 'https://example.com/slow-image.jpg' },
};

/** Error: a broken source falls back to the default avatar. */
export const ErrorFallsBack: Story = {
  args: { src: 'https://example.invalid/broken.jpg', enableVersioning: false },
};
