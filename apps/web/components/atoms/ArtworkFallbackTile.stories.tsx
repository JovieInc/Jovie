import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ArtworkFallbackTile } from './ArtworkFallbackTile';

const meta = {
  title: 'Atoms/ArtworkFallbackTile',
  component: ArtworkFallbackTile,
  parameters: {
    layout: 'centered',
  },
  args: {
    seed: 'rel_1',
  },
  decorators: [
    Story => (
      <div style={{ height: 160, width: 160 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ArtworkFallbackTile>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Hero: Story = {
  args: {
    size: 'hero',
  },
};

export const Thumbnail: Story = {
  args: {
    size: 'thumbnail',
  },
  decorators: [
    Story => (
      <div style={{ height: 48, width: 48 }}>
        <Story />
      </div>
    ),
  ],
};
