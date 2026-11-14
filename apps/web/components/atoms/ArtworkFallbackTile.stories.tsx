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

/** Seed only: no label, so the tile is decorative to assistive tech. */
export const PartialNoLabel: Story = {
  args: { label: undefined },
};

/** A long release title as the screen-reader label; the face is unchanged. */
export const LongContentLabel: Story = {
  args: {
    label:
      'Never Say A Word (Extended Club Mix) feat. The Los Angeles After Hours Orchestra',
  },
};

/** The sleeve, glyph and accent bar inside a right-to-left page. */
export const Rtl: Story = {
  args: { label: 'منتصف الليل' },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar' style={{ height: 160, width: 160 }}>
        <Story />
      </div>
    ),
  ],
};
