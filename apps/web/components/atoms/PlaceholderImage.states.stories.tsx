import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { PlaceholderImage } from './PlaceholderImage';

const meta = {
  title: 'Atoms/PlaceholderImage/States',
  component: PlaceholderImage,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof PlaceholderImage>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: no children, so the default person glyph fills the tile. */
export const EmptyDefaultGlyph: Story = {};

/** Partial: only the size is set; shape falls back to a circle. */
export const PartialSizeOnly: Story = { args: { size: 'xl' } };

/** Long content: initials wider than the tile stay inside the shape. */
export const LongContentInitials: Story = {
  args: {
    size: 'sm',
    shape: 'rounded',
    children: <span className='truncate text-2xs'>ABCDEFGHIJ</span>,
  },
};

/** Right-to-left: an Arabic initial inside the tile. */
export const RtlInitial: Story = {
  args: { children: <span dir='rtl'>ع</span> },
};
