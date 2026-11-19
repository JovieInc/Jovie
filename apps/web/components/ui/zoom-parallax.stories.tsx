import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ZoomParallax } from './zoom-parallax';

const IMAGES = [
  {
    src: '/images/feature_speed_minimal_arc_1344x1280.webp',
    alt: 'Speed feature artwork',
  },
  {
    src: '/images/feature_zero_setup_plug_1344x1280.webp',
    alt: 'Zero setup feature artwork',
  },
  {
    src: '/images/feature_opinionated_design_1344x1280.webp',
    alt: 'Opinionated design feature artwork',
  },
];

const meta = {
  title: 'UI/ZoomParallax',
  component: ZoomParallax,
  parameters: { layout: 'fullscreen' },
  args: { images: IMAGES, priorityFirstImage: false },
} satisfies Meta<typeof ZoomParallax>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Three images zoom from the centre as the page scrolls. */
export const Default: Story = {};

/** Empty: no images, so only the scroll track and sticky stage render. */
export const EmptyImages: Story = {
  args: { images: [] },
};
