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

export const ErrorRejectedToggleReverts: Story = {
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

/** The save never settles: the switch shows the new value and stays
 *  disabled while the request is pending. */
export const LoadingSave: Story = {
  args: {
    onToggle: fn(() => new Promise<void>(() => undefined)),
  },
  play: async ({ canvasElement }) => {
    const toggle = within(canvasElement).getByRole('switch');
    await userEvent.click(toggle);
    await waitFor(() => expect(toggle).toBeDisabled());
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
  },
};

/** The network is down: the save rejects like a failed fetch, the switch
 *  reverts and the row is usable again. */
export const OfflineSaveReverts: Story = {
  args: {
    checked: true,
    onToggle: fn(() => Promise.reject(new TypeError('Failed to fetch'))),
  },
  play: async ({ canvasElement }) => {
    const toggle = within(canvasElement).getByRole('switch');
    await userEvent.click(toggle);
    await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'true'));
    await waitFor(() => expect(toggle).toBeEnabled());
  },
};

export const LongContent: Story = {
  args: {
    label:
      'Notify fans by email and SMS when this release goes live on every streaming service',
    ariaLabel: 'Notify fans when this release goes live',
  },
};

export const Rtl: Story = {
  args: {
    label: 'إظهار في الملف الشخصي',
    ariaLabel: 'إظهار في الملف الشخصي',
  },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
};
