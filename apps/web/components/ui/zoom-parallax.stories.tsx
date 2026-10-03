import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ZoomParallaxImage } from './zoom-parallax';
import { ZoomParallax } from './zoom-parallax';

const PLACEHOLDER_IMAGES: ZoomParallaxImage[] = Array.from(
  { length: 7 },
  (_, i) => ({
    src: `https://placehold.co/600x600/111827/f5f5f5?text=${i + 1}`,
    alt: `Parallax placeholder ${i + 1}`,
  })
);

const meta = {
  title: 'UI/ZoomParallax',
  component: ZoomParallax,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Scroll-driven zoom parallax. The container reserves 300vh of scroll height, so scroll within the canvas to see the effect; it collapses to a static layout under reduced motion.',
      },
    },
  },
  args: {
    images: PLACEHOLDER_IMAGES,
  },
} satisfies Meta<typeof ZoomParallax>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithoutPriorityImage: Story = {
  args: {
    priorityFirstImage: false,
  },
};
