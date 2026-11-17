import { Button } from '@jovie/ui';
import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { TableToolbar } from './TableToolbar';

const withFrame: Decorator = Story => (
  <div className='w-full max-w-md'>
    <Story />
  </div>
);

const withRtlFrame: Decorator = Story => (
  <div dir='rtl' className='w-full max-w-md'>
    <Story />
  </div>
);

const meta = {
  title: 'Features/Dashboard/Organisms/Table/TableToolbar States',
  component: TableToolbar,
  parameters: { layout: 'centered' },
  args: {
    totalCount: 42,
    onSelectAll: fn(),
    onDeselectAll: fn(),
  },
} satisfies Meta<typeof TableToolbar>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: a table with no rows reports zero and nothing selected. */
export const EmptyNoRows: Story = {
  args: { totalCount: 0 },
  decorators: [withFrame],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('0 total')).toBeVisible();
    await expect(
      canvas.getByRole('checkbox', { name: 'Select All Rows' })
    ).not.toBeChecked();
  },
};

/** Partial: only a count, with no selection handlers and no actions. */
export const PartialCountOnly: Story = {
  args: { onSelectAll: undefined, onDeselectAll: undefined },
  decorators: [withFrame],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('42 total')).toBeVisible();
    await expect(canvas.queryByRole('checkbox')).toBeNull();
  },
};

/** Partial: some rows selected puts the checkbox in its mixed state. */
export const PartialSomeRowsSelected: Story = {
  args: {
    selectedCount: 5,
    bulkActions: (
      <Button variant='ghost' size='sm'>
        Delete
      </Button>
    ),
    actions: (
      <Button variant='ghost' size='sm'>
        Export
      </Button>
    ),
  },
  decorators: [withFrame],
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('5 selected')).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Delete' })).toBeVisible();
    await expect(canvas.queryByRole('button', { name: 'Export' })).toBeNull();
    await userEvent.click(
      canvas.getByRole('checkbox', { name: 'Select All Rows' })
    );
    await expect(args.onSelectAll).toHaveBeenCalledTimes(1);
  },
};

/** Long content: seven-digit counts and several actions in a narrow frame. */
export const LongContentCountsAndActions: Story = {
  args: {
    totalCount: 1234567,
    actions: (
      <>
        <Button variant='ghost' size='sm'>
          Import releases
        </Button>
        <Button variant='ghost' size='sm'>
          Export everything
        </Button>
      </>
    ),
  },
  decorators: [withFrame],
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByText('1234567 total')
    ).toBeVisible();
  },
};

/** Right-to-left: every row selected inside an RTL document. */
export const RtlAllSelected: Story = {
  args: { selectedCount: 42 },
  decorators: [withRtlFrame],
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole('checkbox', { name: 'Select All Rows' })
    ).toBeChecked();
  },
};
