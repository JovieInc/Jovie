import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { DesktopSurfaceImage } from './DesktopSurfaceImage';

const meta = {
  title: 'Profile/DesktopSurfaceImage',
  component: DesktopSurfaceImage,
  parameters: {
    layout: 'centered',
  },
  args: {
    src: '/images/avatars/tim-white.jpg',
    alt: 'Tim White cover',
    sizes: '(max-width: 1536px) 60vw, 900px',
    className: 'object-cover',
  },
  decorators: [
    Story => (
      <div style={{ position: 'relative', height: 320, width: 480 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof DesktopSurfaceImage>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Desktop cover: lazy image, preload scoped to the desktop breakpoint. */
export const Cover: Story = {};

/** No cover URL: the release placeholder takes the image's place. */
export const MissingSource: Story = {
  args: {
    src: null,
    fallbackVariant: 'release',
  },
};
