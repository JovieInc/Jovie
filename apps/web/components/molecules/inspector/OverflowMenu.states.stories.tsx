import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { OverflowMenu } from './OverflowMenu';

const column: Decorator = function InspectorColumn(Story) {
  return (
    <div className='w-80 max-w-full'>
      <Story />
    </div>
  );
};

const rtl: Decorator = function RtlFrame(Story) {
  return (
    <div dir='rtl' lang='ar' className='w-80 max-w-full'>
      <Story />
    </div>
  );
};

/** State coverage for the L4 overflow; the open, disabled and no-action menus live in OverflowMenu.stories.tsx. */
const meta = {
  title: 'Molecules/Inspector/OverflowMenu States',
  component: OverflowMenu,
  decorators: [column],
  parameters: {
    layout: 'centered',
    jovie: { uncoveredProps: ['align', 'testId'] },
  },
  args: {
    label: 'Share link actions',
    items: [{ id: 'open', label: 'Open', onSelect: fn() }],
  },
} satisfies Meta<typeof OverflowMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: with no verbs to offer, the trigger is disabled. */
export const EmptyNoActions: Story = {
  args: { items: [] },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole('button', { name: 'Share link actions' })
    ).toBeDisabled();
  },
};

/** Partial: one enabled verb next to one disabled verb. */
export const PartialOneDisabled: Story = {
  args: {
    items: [
      { id: 'open', label: 'Open', onSelect: fn() },
      { id: 'copy', label: 'Copy link', onSelect: fn(), disabled: true },
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      canvas.getByRole('button', { name: 'Share link actions' })
    );
    await expect(
      await body.findByRole('menuitem', { name: 'Copy link' })
    ).toHaveAttribute('data-disabled');
  },
};

/** Long content: many verbs with long labels and a destructive verb last. */
export const LongContentManyActions: Story = {
  args: {
    items: [
      {
        id: 'open',
        label: 'Open the private share link in a new tab',
        onSelect: fn(),
      },
      {
        id: 'copy',
        label: 'Copy the private share link to the clipboard',
        onSelect: fn(),
      },
      {
        id: 'rename',
        label: 'Rename this share link for the press kit',
        onSelect: fn(),
      },
      {
        id: 'expire',
        label: 'Set an expiry date for every recipient',
        onSelect: fn(),
      },
      {
        id: 'revoke',
        label: 'Revoke the private link for every recipient',
        variant: 'destructive',
        separatorBefore: true,
        onSelect: fn(),
      },
    ],
  },
};

/** Right-to-left: Arabic verbs in an RTL inspector. */
export const RtlArabic: Story = {
  args: {
    label: 'إجراءات الرابط',
    items: [
      { id: 'open', label: 'فتح', onSelect: fn() },
      {
        id: 'revoke',
        label: 'إلغاء الرابط الخاص',
        variant: 'destructive',
        separatorBefore: true,
        onSelect: fn(),
      },
    ],
  },
  decorators: [rtl],
};
