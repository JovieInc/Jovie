import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { DrawerAsyncToggle } from './DrawerAsyncToggle';

const meta = {
  title: 'Molecules/Drawer/DrawerAsyncToggle',
  component: DrawerAsyncToggle,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <div className='w-72 bg-surface-0 p-3'>
        <Story />
      </div>
    ),
  ],
  args: {
    label: 'Show on profile',
    ariaLabel: 'Show on profile',
    checked: false,
    onToggle: fn(() => Promise.resolve()),
  },
} satisfies Meta<typeof DrawerAsyncToggle>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    const toggle = within(canvasElement).getByRole('switch');
    await userEvent.click(toggle);
    await expect(args.onToggle).toHaveBeenCalledWith(true);
  },
};

export const Checked: Story = {
  args: {
    checked: true,
  },
};

export const CompactDensity: Story = {
  args: {
    density: 'compact',
  },
};

export const RejectedToggleRevertsState: Story = {
  args: {
    onToggle: fn(() => Promise.reject(new Error('save failed'))),
  },
  play: async ({ canvasElement, args }) => {
    const toggle = within(canvasElement).getByRole('switch');
    await userEvent.click(toggle);
    await expect(args.onToggle).toHaveBeenCalledWith(true);
    await waitFor(() =>
      expect(toggle).toHaveAttribute('aria-checked', 'false')
    );
  },
};
