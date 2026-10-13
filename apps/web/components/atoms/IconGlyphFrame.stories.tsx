import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Ticket } from 'lucide-react';
import { expect, userEvent, within } from 'storybook/test';
import { IconGlyphFrame } from './IconGlyphFrame';

const meta = {
  title: 'Atoms/IconGlyphFrame',
  component: IconGlyphFrame,
  parameters: { layout: 'centered' },
  args: { hoverSurface: 'var(--color-surface-1)' },
} satisfies Meta<typeof IconGlyphFrame>;
export default meta;
type Story = StoryObj<typeof meta>;
export const TicketControl: Story = {
  render: args => (
    <button
      type='button'
      aria-label='Tickets'
      className='focus-ring-themed inline-flex size-11 items-center justify-center rounded-full bg-transparent'
    >
      <IconGlyphFrame {...args}>
        <Ticket className='size-4 text-warning' aria-hidden />
      </IconGlyphFrame>
    </button>
  ),
  play: async ({ canvasElement }) => {
    const button = within(canvasElement).getByRole('button', {
      name: 'Tickets',
    });
    await userEvent.tab();
    await expect(button).toHaveFocus();
    await userEvent.hover(button.querySelector('[data-icon-glyph]')!);
    await expect(button).toHaveAccessibleName('Tickets');
  },
};
