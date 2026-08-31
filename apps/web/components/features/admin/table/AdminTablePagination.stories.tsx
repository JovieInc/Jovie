import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { AdminTablePagination } from './AdminTablePagination';

const meta = {
  title: 'Features/Admin/Table/AdminTablePagination',
  component: AdminTablePagination,
  parameters: {
    layout: 'centered',
    jovie: {
      uncoveredProps: [
        'page',
        'totalPages',
        'from',
        'to',
        'total',
        'canPrev',
        'canNext',
      ],
    },
  },
} satisfies Meta<typeof AdminTablePagination>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
