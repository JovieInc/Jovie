import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { ContactDeleteConfirmDialog } from './ContactDeleteConfirmDialog';

/**
 * State coverage for the contact delete confirmation. Same args as the
 * canonical stories; each state changes only the contact label or the
 * document direction.
 */
const meta = {
  title: 'Dashboard/Molecules/ContactDeleteConfirmDialog States',
  component: ContactDeleteConfirmDialog,
  parameters: {
    layout: 'centered',
  },
  args: {
    contact: { role: 'management', customLabel: null },
    onConfirm: fn(),
    onCancel: fn(),
  },
} satisfies Meta<typeof ContactDeleteConfirmDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Long content: a long custom contact label wraps inside the description. */
export const LongContentCustomLabel: Story = {
  args: {
    contact: {
      role: 'other',
      customLabel:
        'European festival booking and routing partner for the spring and summer tour legs',
    },
  },
};

/** Right-to-left: an Arabic custom label inside an RTL document. */
export const RtlDocument: Story = {
  args: {
    contact: { role: 'other', customLabel: 'وكيل الحجوزات' },
  },
  decorators: [
    Story => (
      <div dir='rtl'>
        <Story />
      </div>
    ),
  ],
};
