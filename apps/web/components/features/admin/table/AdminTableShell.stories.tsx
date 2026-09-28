import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { AdminTableShell } from './AdminTableShell';

const DEMO_ROWS = Array.from({ length: 40 }, (_, i) => `Row ${i + 1}`);

const meta = {
  title: 'Features/Admin/AdminTableShell',
  component: AdminTableShell,
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    toolbar: (
      <div className='px-4 py-2 text-sm text-secondary-token'>Toolbar</div>
    ),
    footer: <div className='px-4 py-2 text-xs text-tertiary-token'>Footer</div>,
    children: ({ headerElevated, stickyTopPx }) => (
      <div className='space-y-2 p-4'>
        <p className='text-xs text-tertiary-token'>
          headerElevated: {String(headerElevated)} · stickyTopPx: {stickyTopPx}
        </p>
        {DEMO_ROWS.map(row => (
          <div
            key={row}
            className='rounded-md border border-subtle px-3 py-2 text-sm'
          >
            {row}
          </div>
        ))}
      </div>
    ),
  },
  decorators: [
    Story => (
      <div className='h-96 w-full'>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof AdminTableShell>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithoutChrome: Story = {
  args: {
    toolbar: undefined,
    footer: undefined,
  },
};
