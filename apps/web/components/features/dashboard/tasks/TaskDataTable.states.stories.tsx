import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, within } from 'storybook/test';
import type { ColumnDef } from '@/lib/tanstack-table';
import {
  TASK_DATA_TABLE_MULTILINE_CELL_CONTENT_CLASSNAME,
  TaskDataTable,
} from './TaskDataTable';

type TaskRow = { id: string; title: string; status: string };

const LONG_TITLE =
  'Prepare the final distributor handoff with approved artwork, licensing, split sheets, campaign metadata and every regional delivery note';

const columns: ColumnDef<TaskRow, unknown>[] = [
  {
    accessorKey: 'title',
    header: 'Title',
    size: 9999,
    meta: {
      cellContentClassName: TASK_DATA_TABLE_MULTILINE_CELL_CONTENT_CLASSNAME,
    },
  },
  { accessorKey: 'status', header: 'Status' },
];

const longRows: TaskRow[] = [
  { id: '1', title: LONG_TITLE, status: 'Open' },
  { id: '2', title: 'Confirm release metadata', status: 'Done' },
];

const rtlRows: TaskRow[] = [
  { id: '1', title: 'مراجعة بيانات الإصدار', status: 'مفتوحة' },
  { id: '2', title: 'تأكيد صورة الغلاف', status: 'منجزة' },
];

const withNarrowFrame: Decorator = Story => (
  <div className='w-full max-w-md'>
    <Story />
  </div>
);

const withRtlFrame: Decorator = Story => (
  <div dir='rtl' className='w-full max-w-md'>
    <Story />
  </div>
);

const meta: Meta<typeof TaskDataTable<TaskRow>> = {
  title: 'Dashboard/Tasks/TaskDataTable States',
  component: TaskDataTable,
  parameters: { layout: 'fullscreen' },
  args: {
    columns,
    data: longRows,
    getRowId: row => row.id,
  },
};

export default meta;
type Story = StoryObj<typeof TaskDataTable<TaskRow>>;

/** Long content: a long task title wraps inside its multiline cell. */
export const LongContentTaskTitle: Story = {
  decorators: [withNarrowFrame],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(LONG_TITLE)).toBeVisible();
    await expect(canvas.getByText('Confirm release metadata')).toBeVisible();
  },
};

/** Right-to-left: task rows inside an RTL document. */
export const RtlTaskRows: Story = {
  args: { data: rtlRows },
  decorators: [withRtlFrame],
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByText('مراجعة بيانات الإصدار')
    ).toBeVisible();
  },
};
