import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ReactNode } from 'react';
import { fn } from 'storybook/test';
import { TableCheckboxCell } from './TableCheckboxCell';

/** Rendered states of the table checkbox cell beyond the default stories. */
const meta = {
  title: 'Organisms/Table/Atoms/TableCheckboxCell/States',
  component: TableCheckboxCell,
  parameters: {
    layout: 'centered',
    jovie: {
      uncoveredProps: [
        'table',
        'row',
        'isChecked',
        'onToggleSelect',
        'headerCheckboxState',
        'onToggleSelectAll',
      ],
    },
  },
  decorators: [
    function withTable(StoryFn) {
      return (
        <table>
          <tbody>
            <tr className='group'>{StoryFn()}</tr>
          </tbody>
        </table>
      );
    },
  ],
  args: { checked: false, onChange: fn(), ariaLabel: 'Select row 1' },
} satisfies Meta<typeof TableCheckboxCell>;

export default meta;
type Story = StoryObj<typeof meta>;

function RtlFrame({ children }: Readonly<{ children: ReactNode }>) {
  return <div dir='rtl'>{children}</div>;
}

function withRtlFrame(StoryFn: () => ReactNode) {
  return <RtlFrame>{StoryFn()}</RtlFrame>;
}

/** Empty: no row number, so the unchecked cell shows only the hover checkbox. */
export const EmptyNoRowNumber: Story = {};

/** Partial: the header cell in the indeterminate state. */
export const PartialIndeterminateHeader: Story = {
  args: { isHeader: true, indeterminate: true, ariaLabel: 'Select All Rows' },
};

/** Long content: a four-digit row number in the narrow cell. */
export const LongContentRowNumber: Story = { args: { rowNumber: 12345 } };

/** Rtl: the checkbox cell in a right-to-left table. */
export const RtlCell: Story = {
  args: { rowNumber: 3, checked: true },
  decorators: [withRtlFrame],
};
