import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ContextMenuOverlay } from './ContextMenuOverlay';

const meta = {
  title: 'Shell/ContextMenuOverlay/States',
  component: ContextMenuOverlay,
  parameters: { layout: 'centered' },
  args: { onClose: () => undefined },
} satisfies Meta<typeof ContextMenuOverlay>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: a menu with no items renders only its empty frame. */
export const Empty: Story = {
  args: { state: { x: 120, y: 80, items: [] } },
};

/** Partial: some actions are disabled while others stay available. */
export const Partial: Story = {
  args: {
    state: {
      x: 120,
      y: 80,
      items: [
        { label: 'Rename', onSelect: () => undefined },
        { label: 'Delete', disabled: true, onSelect: () => undefined },
      ],
    },
  },
};

/** LongContent: a long label truncates inside the menu width. */
export const LongContent: Story = {
  args: {
    state: {
      x: 120,
      y: 80,
      items: [
        {
          label: 'Duplicate this release with every track, credit and link',
          onSelect: () => undefined,
        },
      ],
    },
  },
};

/** Rtl: icons and shortcuts swap sides in a right-to-left page. */
export const Rtl: Story = {
  args: {
    state: {
      x: 120,
      y: 80,
      items: [{ label: 'إعادة تسمية', onSelect: () => undefined }],
    },
  },
  decorators: [
    function RtlFrame(Story) {
      return (
        <div dir='rtl' lang='ar'>
          <Story />
        </div>
      );
    },
  ],
};
