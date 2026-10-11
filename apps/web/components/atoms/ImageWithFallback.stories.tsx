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
