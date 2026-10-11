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
