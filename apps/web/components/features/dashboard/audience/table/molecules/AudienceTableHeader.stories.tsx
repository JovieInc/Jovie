import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { AudienceTableHeader } from './AudienceTableHeader';

const meta = {
  title: 'Features/Dashboard/Audience/Table/Molecules/AudienceTableHeader',
  component: AudienceTableHeader,
  parameters: {
    layout: 'centered',
    jovie: {
      uncoveredProps: [
        'mode',
        'sort',
        'direction',
        'headerCheckboxState',
        'selectedCount',
        'headerElevated',
        'totalCount',
        'onSortChange',
        'onToggleSelectAll',
        'bulkActions',
        'disabled',
      ],
    },
  },
} satisfies Meta<typeof AudienceTableHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
