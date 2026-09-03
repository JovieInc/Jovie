import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { AdminCreatorsTableHeader } from './AdminCreatorsTableHeader';

const meta = {
  title: 'Features/Admin/Table/AdminCreatorsTableHeader',
  component: AdminCreatorsTableHeader,
  parameters: {
    layout: 'centered',
    jovie: {
      uncoveredProps: [
        'sort',
        'headerCheckboxState',
        'selectedCount',
        'headerElevated',
        'stickyTopPx',
        'onToggleSelectAll',
        'onSortChange',
      ],
    },
  },
} satisfies Meta<typeof AdminCreatorsTableHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
