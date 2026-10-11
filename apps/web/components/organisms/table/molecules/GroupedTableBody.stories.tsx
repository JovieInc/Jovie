import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { GroupedTableBody } from './GroupedTableBody';

interface Row {
  readonly id: string;
  readonly name: string;
}

const groupedData = [
  {
    key: 'new',
    label: 'New',
    count: 2,
    rows: [
      { id: 'r1', name: 'Jamie Rivera' },
      { id: 'r2', name: 'Alex Chen' },
    ] as Row[],
  },
  {
    key: 'returning',
    label: 'Returning',
    count: 1,
    rows: [{ id: 'r3', name: 'Sam Patel' }] as Row[],
  },
];

const meta = {
  title: 'Organisms/Table/Molecules/GroupedTableBody',
  component: GroupedTableBody<Row>,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <table className='w-96 text-sm text-primary-token'>
        <Story />
      </table>
    ),
  ],
  args: {
    groupedData,
    observeGroupHeader: () => {},
    columns: 2,
    renderRow: (row: Row) => (
      <tr key={row.id}>
        <td className='px-4 py-2' colSpan={2}>
          {row.name}
        </td>
      </tr>
    ),
  },
} satisfies Meta<typeof GroupedTableBody<Row>>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const SingleGroup: Story = {
  args: {
    groupedData: groupedData.slice(0, 1),
  },
};
