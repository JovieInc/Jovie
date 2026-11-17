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

export const EmptyNoHiddenColumns: Story = {
  args: {
    value: { primaryId: 'fan', items: [] },
    children: <PrimaryCell row={{ name: 'Avery Chen' }} />,
  },
};

export const LongContentFolded: Story = {
  args: {
    value: {
      primaryId: 'fan',
      items: [
        { id: 'state', render: () => 'Awaiting Confirmation From Label' },
        { id: 'source', render: () => 'Instagram Story Link In Bio Campaign' },
        { id: 'last', render: () => '3 weeks ago' },
      ],
    },
    children: (
      <PrimaryCell
        row={{
          name: 'Alexandria Constantinople-Whitfield of The Midnight Orchestra',
        }}
      />
    ),
  },
};

export const RtlFolded: Story = {
  args: {
    value: {
      primaryId: 'fan',
      items: [
        { id: 'state', render: () => 'نشط' },
        { id: 'last', render: () => 'قبل ساعتين' },
      ],
    },
    children: (
      <div dir='rtl' lang='ar'>
        <PrimaryCell row={{ name: 'ليلى حداد' }} />
      </div>
    ),
  },
};
