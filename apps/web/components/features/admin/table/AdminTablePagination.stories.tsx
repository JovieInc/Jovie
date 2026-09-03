import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { AdminTablePagination } from './AdminTablePagination';

const meta = {
  title: 'Features/Admin/Table/AdminTablePagination',
  component: AdminTablePagination,
  parameters: {
    layout: 'fullscreen',
  },
  decorators: [
    Story => (
      <div className='bg-(--app-shell-content-surface) p-4'>
        <Story />
      </div>
    ),
  ],
  args: {
    page: 2,
    totalPages: 5,
    from: 21,
    to: 40,
    total: 91,
    canPrev: true,
    canNext: true,
    prevHref: '/admin?page=1',
    nextHref: '/admin?page=3',
    entityLabel: 'records',
  },
} satisfies Meta<typeof AdminTablePagination>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const FirstPageDisabled: Story = {
  args: {
    page: 1,
    from: 1,
    to: 20,
    canPrev: false,
    prevHref: '/admin?page=0',
    nextHref: '/admin?page=2',
  },
};

export const PageSizeSelector: Story = {
  args: {
    pageSize: 20,
    onPageSizeChange: fn(),
    pageSizeOptions: [10, 20, 50],
  },
};

export const MobileCompact: Story = {
  decorators: [
    Story => (
      <div className='w-80 bg-(--app-shell-content-surface) p-3'>
        <Story />
      </div>
    ),
  ],
};
