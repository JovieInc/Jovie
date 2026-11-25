import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { AdminTableShell } from './AdminTableShell';

const meta = {
  title: 'Features/Admin/AdminTableShell/States',
  component: AdminTableShell,
  parameters: { layout: 'fullscreen' },
  args: { testId: 'admin-table-shell-state' },
} satisfies Meta<typeof AdminTableShell>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: the body has no rows to show. */
export const EmptyBody: Story = {
  args: {
    children: () => (
      <p className='p-4 text-sm text-secondary-token'>No creators yet.</p>
    ),
  },
};

/** Partial: a toolbar without a footer. */
export const PartialToolbarOnly: Story = {
  args: {
    toolbar: (
      <div className='px-4 py-2 text-sm font-medium text-primary-token'>
        Creators
      </div>
    ),
    children: () => <p className='p-4 text-sm text-secondary-token'>Rows</p>,
  },
};

/** Long content: a long toolbar title and tall scrolling body. */
export const LongContentScrollingBody: Story = {
  args: {
    toolbar: (
      <div className='truncate px-4 py-2 text-sm font-medium text-primary-token'>
        Creators awaiting verification across every connected platform this
        month
      </div>
    ),
    children: () => (
      <section
        className='h-96 overflow-y-auto p-4 text-sm text-secondary-token'
        aria-label='Table Contents'
      >
        <a href='#table-preview-last-row' className='underline'>
          Jump to last row
        </a>
        {Array.from({ length: 59 }, (_, i) => `Row ${i + 1}`).map(row => (
          <p key={row}>{row}</p>
        ))}
        <p id='table-preview-last-row'>Row 60</p>
      </section>
    ),
  },
};

/** Right-to-left: the shell inside an RTL document. */
export const RtlShell: Story = {
  args: {
    toolbar: <div className='px-4 py-2 text-sm'>المبدعون</div>,
    children: () => <p className='p-4 text-sm'>الصفوف</p>,
  },
  decorators: [
    function RtlDecorator(Story) {
      return (
        <div dir='rtl'>
          <Story />
        </div>
      );
    },
  ],
};
