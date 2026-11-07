import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { DisplayText } from './DisplayText';

/**
 * The shared display-type primitive. It measures the first glyph's left
 * side-bearing after the real font loads and pulls the box onto the column
 * line (grid guide rule 5: align the ink, not the box).
 */
const meta = {
  title: 'Atoms/DisplayText',
  component: DisplayText,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof DisplayText>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Display: Story = {
  args: {
    as: 'h1',
    className: 'font-display text-6xl',
    children: 'Move your music forward.',
  },
};
