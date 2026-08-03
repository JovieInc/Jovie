import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { Row } from '@tanstack/react-table';
import { VirtualizedTableBody } from './VirtualizedTableBody';

type RowData = { id: string; title: string };

const rows = [
  { id: 'one', original: { id: 'one', title: 'Never Say A Word' } },
  { id: 'two', original: { id: 'two', title: 'Seaside Heights' } },
] as Row<RowData>[];

const meta: Meta<typeof VirtualizedTableBody<RowData>> = {
  title: 'Organisms/Table/VirtualizedTableBody',
  component: VirtualizedTableBody,
  parameters: { layout: 'padded' },
};

export default meta;
type Story = StoryObj<typeof VirtualizedTableBody<RowData>>;

export const SearchableContextActions: Story = {
  render: args => (
    <table className='w-full text-primary-token'>
      <VirtualizedTableBody {...args} />
    </table>
  ),
  args: {
    rows,
    shouldVirtualize: false,
    rowRefsMap: new Map(),
    shouldEnableKeyboardNav: false,
    focusedIndex: -1,
    onFocusChange: () => undefined,
    onKeyDown: () => undefined,
    columnCount: 1,
    contextMenuSearchable: true,
    contextMenuSearchPlaceholder: 'Search actions',
    contextMenuSearchMode: 'recursive',
    getContextMenuItems: row => [
      {
        id: 'copy-title',
        label: `Copy ${row.title}`,
        onClick: () => undefined,
      },
    ],
  },
};
