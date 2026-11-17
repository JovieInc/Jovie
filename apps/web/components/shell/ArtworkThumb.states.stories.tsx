import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, within } from 'storybook/test';
import { ArtworkThumb } from './ArtworkThumb';

/** State coverage for the artwork tile; Default lives in ArtworkThumb.stories.tsx. */
const meta = {
  title: 'Shell/ArtworkThumb States',
  component: ArtworkThumb,
  parameters: { layout: 'centered' },
  args: {
    src: 'https://placehold.co/640x640/111827/E5E7EB?text=Artwork',
    title: 'Never Say A Word',
    size: 40,
  },
} satisfies Meta<typeof ArtworkThumb>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Loading: the cover tile holds the slot until the source resolves. */
export const LoadingPendingSource: Story = {
  args: { src: 'https://x.invalid/never-resolves.jpg', size: 64 },
  play: async ({ canvasElement }) => {
    await expect(
      canvasElement.querySelector('[data-artwork-state="fallback"]')
    ).not.toBeNull();
  },
};

/** Error: an empty source paints the deterministic cover tile, never a letter. */
export const ErrorEmptySource: Story = {
  args: { src: '', size: 64 },
  play: async ({ canvasElement }) => {
    await expect(
      canvasElement.querySelector('[data-artwork-fallback="true"]')
    ).not.toBeNull();
    await expect(within(canvasElement).queryByText('N')).toBeNull();
  },
};
