import '@/styles/system-b-app.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import {
  ColumnCompactProvider,
  usePrimaryColumnCompacts,
} from './column-priority-context';

function PrimaryCell({ row }: { readonly row: { readonly name: string } }) {
  const { node } = usePrimaryColumnCompacts(row);
  return (
    <div className='flex h-8 max-w-md items-center gap-2 text-sm text-primary-token'>
      <span className='min-w-0 flex-1 truncate'>{row.name}</span>
      {node}
    </div>
  );
}

const meta = {
  title: 'Organisms/Table/ColumnCompactProvider',
  component: ColumnCompactProvider,
  args: {
    value: {
      primaryId: 'fan',
      items: [
        { id: 'state', render: () => 'Active' },
        { id: 'last', render: () => '2h' },
      ],
    },
    children: <PrimaryCell row={{ name: 'Avery Chen' }} />,
  },
} satisfies Meta<typeof ColumnCompactProvider>;

export default meta;
type Story = StoryObj<typeof meta>;

export const FoldedIntoPrimary: Story = {};
