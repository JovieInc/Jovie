import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ReactNode } from 'react';
import { expect, within } from 'storybook/test';
import { AdminTableShell } from './AdminTableShell';

function FrameDecorator(Story: () => ReactNode) {
  return (
    <div className='flex h-96 flex-col bg-base text-primary-token'>
      <Story />
    </div>
  );
}

function RtlFrameDecorator(Story: () => ReactNode) {
  return (
    <div className='flex h-96 flex-col bg-base text-primary-token' dir='rtl'>
      <Story />
    </div>
  );
}

const ROW_LABELS = Array.from(
  { length: 40 },
  (_, index) => `Table row ${index + 1}`
);

function ManyRows() {
  return (
    <ul className='min-h-0 flex-1 overflow-y-auto p-4 text-sm text-secondary-token'>
      {ROW_LABELS.map(label => (
        <li key={label}>{label}</li>
      ))}
    </ul>
  );
}

function renderManyRows() {
  return <ManyRows />;
}

function renderPlainRows() {
  return <div className='p-4 text-sm text-secondary-token'>Table rows</div>;
}

const LONG_TOOLBAR =
  'Creators claimed through the spring partner programme, the label showcase follow-up and direct outreach from the outbound queue';

/** State coverage for the admin table shell. */
const meta = {
  title: 'Features/Admin/AdminTableShell States',
  component: AdminTableShell,
  parameters: { layout: 'fullscreen' },
  args: { testId: 'admin-table-shell', children: renderPlainRows },
} satisfies Meta<typeof AdminTableShell>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Partial: no toolbar and no footer, so the content owns the whole shell. */
export const PartialContentOnly: Story = {
  decorators: [FrameDecorator],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const shell = canvas.getByTestId('admin-table-shell');
    await expect(shell.children).toHaveLength(1);
    await expect(canvas.getByText('Table rows')).toBeVisible();
  },
};

/** Long content: a long toolbar and more rows than fit; the footer stays put. */
export const LongContentRows: Story = {
  args: {
    toolbar: (
      <div className='truncate px-4 py-2 text-sm font-medium text-primary-token'>
        {LONG_TOOLBAR}
      </div>
    ),
    footer: (
      <div className='px-4 py-2 text-xs text-secondary-token'>
        2,520,871 creators
      </div>
    ),
    children: renderManyRows,
  },
  decorators: [FrameDecorator],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(LONG_TOOLBAR)).toBeVisible();
    await expect(canvas.getByText('2,520,871 creators')).toBeVisible();
    await expect(canvas.getByText('Table row 40')).toBeInTheDocument();
  },
};

/** Right-to-left: toolbar, content and footer inside an RTL document. */
export const RtlShell: Story = {
  args: {
    toolbar: (
      <div className='px-4 py-2 text-sm font-medium text-primary-token'>
        المبدعون
      </div>
    ),
    footer: (
      <div className='px-4 py-2 text-xs text-secondary-token'>1,204 مبدعًا</div>
    ),
  },
  decorators: [RtlFrameDecorator],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('المبدعون')).toBeVisible();
  },
};
