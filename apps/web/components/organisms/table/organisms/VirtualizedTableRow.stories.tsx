import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { Row } from '@tanstack/react-table';
import { VirtualizedTableRow } from './VirtualizedTableRow';

type Item = { id: string; name: string };

function mockRow(id: string, name: string): Row<Item> {
  return {
    id,
    original: { id, name },
    getVisibleCells: () => [
      {
        id: `${id}-name`,
        column: {
          id: 'name',
          columnDef: {
            cell: () => name,
            meta: undefined,
          },
          getSize: () => 160,
        },
        getContext: () => ({}),
      },
    ],
    getIsSelected: () => false,
  } as unknown as Row<Item>;
}

const meta: Meta<typeof VirtualizedTableRow> = {
  title: 'Organisms/Table/VirtualizedTableRow',
  component: VirtualizedTableRow,
  parameters: {
    layout: 'padded',
  },
};

export default meta;
type Story = StoryObj<typeof VirtualizedTableRow>;

export const Default: Story = {
  render: () => (
    <table className='w-full border border-subtle bg-surface text-primary'>
      <tbody>
        <VirtualizedTableRow
          row={mockRow('1', 'Alpha')}
          rowIndex={0}
          rowRefsMap={new Map()}
          shouldEnableKeyboardNav={false}
          shouldVirtualize={false}
          focusedIndex={-1}
          onKeyDown={() => undefined}
          onFocusChange={() => undefined}
        />
      </tbody>
    </table>
  ),
};
