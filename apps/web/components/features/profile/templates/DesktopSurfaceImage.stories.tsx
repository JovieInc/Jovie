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

/**
 * Loading: the image is lazy, so while it sits outside the viewport (or, on a
 * phone, inside the hidden desktop surface) the browser has not requested it.
 * Scroll the frame to watch it load.
 */
export const LoadingBelowFold: Story = {
  decorators: [
    Story => (
      <section
        aria-label='Desktop cover loading frame'
        // biome-ignore lint/a11y/noNoninteractiveTabindex: keyboard entry point for the scrollable region (axe scrollable-region-focusable)
        tabIndex={0}
        style={{ height: 320, width: 480, overflowY: 'auto' }}
      >
        <div style={{ height: 1600 }} />
        <div style={{ position: 'relative', height: 320, width: 480 }}>
          <Story />
        </div>
      </section>
    ),
  ],
};

/**
 * Offline: the cover request fails (no network, or an expired CDN URL), so the
 * placeholder takes its place. The broken data URL fails deterministically
 * without a network call.
 */
export const OfflineBrokenSource: Story = {
  args: {
    src: 'data:image/png;base64,AAAA',
    fallbackVariant: 'avatar',
  },
};
