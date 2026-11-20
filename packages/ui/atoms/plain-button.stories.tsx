import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { PlainButton } from './plain-button';

const meta: Meta<typeof PlainButton> = {
  title: 'UI/Atoms/PlainButton',
  component: PlainButton,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
  args: { onClick: fn() },
};
export default meta;
type Story = StoryObj<typeof meta>;

/** Unstyled: the component that uses it owns the look. */
export const Default: Story = {
  args: { children: 'Open release' },
  play: async ({ canvasElement, args }) => {
    const button = within(canvasElement).getByRole('button', {
      name: 'Open release',
    });
    await expect(button).toHaveAttribute('type', 'button');
    await userEvent.click(button);
    await expect(args.onClick).toHaveBeenCalledTimes(1);
  },
};

/** A row surface styled by its caller, as the migrated components use it. */
export const StyledRow: Story = {
  args: {
    className:
      'flex w-64 items-center justify-between rounded-md px-3 py-2 text-sm text-primary-token hover:bg-interactive-hover',
    children: (
      <>
        <span>Midnight Drive</span>
        <span className='text-tertiary-token'>3:42</span>
      </>
    ),
  },
};

export const Disabled: Story = {
  args: { children: 'Send', disabled: true },
  play: async ({ canvasElement, args }) => {
    const button = within(canvasElement).getByRole('button', { name: 'Send' });
    await expect(button).toBeDisabled();
    await expect(button).toHaveAttribute('data-disabled', '');
    await expect(args.onClick).not.toHaveBeenCalled();
  },
};

/** Keyboard focus shows the shared ring when the caller brings none. */
export const KeyboardFocus: Story = {
  args: { children: 'Next', className: 'rounded-md px-3 py-2 text-sm' },
  play: async ({ canvasElement }) => {
    await userEvent.tab();
    const button = within(canvasElement).getByRole('button', { name: 'Next' });
    await expect(button).toHaveFocus();
    await expect(button).toHaveClass('focus-visible:ring-focus');
  },
};

/** Long labels wrap inside whatever width the caller gives. */
export const LongContent: Story = {
  args: {
    className: 'w-48 rounded-md px-3 py-2 text-start text-sm',
    children:
      'A very long label for a pressable row that has to wrap onto a second line',
  },
};

export const Rtl: Story = {
  render: args => (
    <div dir='rtl'>
      <PlainButton {...args} className='rounded-md px-3 py-2 text-sm'>
        فتح الإصدار
      </PlainButton>
    </div>
  ),
};
