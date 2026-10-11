import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { AdminTableShell } from './AdminTableShell';

const meta = {
  title: 'Features/Admin/AdminTableShell',
  component: AdminTableShell,
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof AdminTableShell>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithToolbarAndFooter: Story = {
  args: {
    testId: 'admin-table-shell',
    toolbar: (
      <div className='px-4 py-2 text-sm font-medium text-primary-token'>
        Creators
      </div>
    ),
    footer: (
      <div className='px-4 py-2 text-xs text-secondary-token'>
        1,204 creators
      </div>
    ),
    children: () => (
      <div className='p-4 text-sm text-secondary-token'>Table rows</div>
    ),
  },
};
