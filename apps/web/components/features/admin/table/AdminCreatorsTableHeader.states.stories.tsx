import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ReactNode } from 'react';
import { expect, fn, within } from 'storybook/test';
import { AdminCreatorsTableHeader } from './AdminCreatorsTableHeader';

function RtlTableDecorator(Story: () => ReactNode) {
  return (
    <div className='w-full bg-(--app-shell-content-surface)' dir='rtl'>
      <table className='w-full'>
        <Story />
      </table>
    </div>
  );
}

/**
 * State coverage for the creators table header. Its labels are fixed and it
 * holds no rows, so the state a story can change is the document direction.
 */
const meta = {
  title: 'Features/Admin/Table/AdminCreatorsTableHeader States',
  component: AdminCreatorsTableHeader,
  parameters: { layout: 'fullscreen' },
  args: {
    sort: 'created_desc',
    headerCheckboxState: 'indeterminate',
    selectedCount: 2,
    headerElevated: false,
    stickyTopPx: 0,
    onToggleSelectAll: fn(),
    onSortChange: fn(),
  },
} satisfies Meta<typeof AdminCreatorsTableHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Right-to-left: the select-all box leads from the right edge. */
export const RtlHeader: Story = {
  decorators: [RtlTableDecorator],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getAllByRole('columnheader')).toHaveLength(5);
    await expect(
      canvas.getByRole('checkbox', { name: 'Select All Creators' })
    ).toBeVisible();
  },
};
