import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ImageWithFallback } from './ImageWithFallback';

const meta = {
  title: 'Atoms/ImageWithFallback',
  component: ImageWithFallback,
  parameters: {
    layout: 'centered',
  },
  args: {
    src: null,
    alt: 'Album artwork',
  },
  decorators: [
    Story => (
      <div style={{ position: 'relative', height: 160, width: 160 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ImageWithFallback>;

export default meta;
type Story = StoryObj<typeof meta>;

export const GenericFallback: Story = {};

export const ReleaseFallback: Story = {
  args: {
    fallbackVariant: 'release',
  },
};

export const AvatarFallback: Story = {
  args: {
    alt: '',
    fallbackVariant: 'avatar',
  },
};

export const FillFallback: Story = {
  args: {
    fill: true,
    fallbackVariant: 'release',
  },
};

/** No artwork URL at all: the release placeholder takes the image's place. */
export const EmptySource: Story = {
  args: {
    src: undefined,
    alt: 'Night Drive artwork',
    fallbackVariant: 'release',
    fill: true,
  },
};

/**
 * The source exists but fails to decode (an expired CDN URL behaves the same),
 * so the image swaps to the placeholder. The broken data URL keeps the story
 * offline and fails deterministically.
 */
export const ErrorBrokenSource: Story = {
  args: {
    src: 'data:image/png;base64,AAAA',
    alt: 'Night Drive artwork',
    fallbackVariant: 'release',
    fill: true,
  },
};
