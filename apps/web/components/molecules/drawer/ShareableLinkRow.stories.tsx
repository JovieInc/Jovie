import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { ShareableLinkRow } from './ShareableLinkRow';

const meta = {
  title: 'Molecules/Drawer/ShareableLinkRow',
  component: ShareableLinkRow,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <div className='w-72 bg-surface-1 p-3'>
        <Story />
      </div>
    ),
  ],
  args: {
    url: 'https://jov.ie/tim',
    // Deterministic stand-in for navigator.clipboard, which isn't reliably
    // grantable in the headless a11y/interaction lane.
    onCopy: fn(() => Promise.resolve()),
    onCopySuccess: fn(),
    onCopyError: fn(),
  },
} satisfies Meta<typeof ShareableLinkRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Rail: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const copyButton = canvas.getByRole('button', { name: 'Copy link' });
    await userEvent.click(copyButton);
    await expect(args.onCopySuccess).toHaveBeenCalled();
  },
};

export const Compact: Story = {
  args: {
    density: 'compact',
  },
};

export const Table: Story = {
  args: {
    density: 'table',
  },
};

export const FlatSurface: Story = {
  args: {
    surface: 'flat',
  },
};

export const HoverOnlyActions: Story = {
  args: {
    actionsVisibility: 'hover',
  },
};

export const NoOpenButton: Story = {
  args: {
    showOpen: false,
  },
};

/**
 * Error: the clipboard write was refused. The row reports the failure to its
 * owner (which shows the toast) and never claims the link was copied.
 */
export const ErrorCopyRejected: Story = {
  args: {
    onCopy: fn(() => Promise.reject(new Error('Clipboard permission denied'))),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Copy link' }));
    await expect(args.onCopyError).toHaveBeenCalled();
    await expect(args.onCopySuccess).not.toHaveBeenCalled();
    await expect(
      canvas.getByRole('button', { name: 'Copy link' })
    ).toBeInTheDocument();
  },
};

/** Long content: a long tracked link truncates while both actions stay put. */
export const LongContentUrl: Story = {
  args: {
    url: 'https://jov.ie/the-midnight-collective-official/releases/a-very-long-release-title-deluxe-edition?utm_source=newsletter&utm_campaign=autumn',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole('button', { name: 'Copy link' })
    ).toBeVisible();
    await expect(
      canvas.getByRole('button', { name: 'Open link' })
    ).toBeVisible();
  },
};

/** Right-to-left: an Arabic display value inside an RTL drawer. */
export const RtlArabicDisplayValue: Story = {
  args: {
    url: 'https://jov.ie/amr',
    displayValue: 'jov.ie/عمرو-دياب',
    copyButtonTitle: 'نسخ الرابط',
    openButtonTitle: 'فتح الرابط',
  },
  decorators: [
    Story => (
      <div dir='rtl'>
        <Story />
      </div>
    ),
  ],
};
