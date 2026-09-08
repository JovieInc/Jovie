import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { TableCheckboxCell } from './TableCheckboxCell';

const meta = {
  title: 'Organisms/Table/Atoms/TableCheckboxCell',
  component: TableCheckboxCell,
  parameters: {
    layout: 'centered',
    jovie: {
      uncoveredProps: [
        'table',
        'row',
        'rowNumber',
        'isChecked',
        'onToggleSelect',
        'headerCheckboxState',
        'onToggleSelectAll',
        'isHeader',
        'indeterminate',
      ],
    },
  },
  args: {
    checked: false,
    onChange: fn(),
    ariaLabel: 'Select row 1',
    rowNumber: 1,
  },
} satisfies Meta<typeof TableCheckboxCell>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Checked: Story = {
  args: {
    checked: true,
  },
};
