import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { KanbanBoard, type KanbanBoardProps } from './KanbanBoard';

interface StoryItem {
  readonly id: string;
  readonly label: string;
}

function KanbanBoardStateHarness(props: KanbanBoardProps<StoryItem>) {
  return <KanbanBoard {...props} />;
}

const meta = {
  title: 'Features/Admin/Table/KanbanBoard/States',
  component: KanbanBoardStateHarness,
  parameters: {
    layout: 'fullscreen',
    jovie: { uncoveredProps: ['cardHeight', 'className'] },
  },
  decorators: [
    function BoardFrame(Story) {
      return (
        <div className='h-96 bg-base text-primary-token'>
          <Story />
        </div>
      );
    },
  ],
  args: {
    columns: [{ id: 'new', title: 'New', items: [], count: 0 }],
    renderCard: (item: StoryItem) => <p>{item.label}</p>,
    getItemId: (item: StoryItem) => item.id,
    enableVirtualization: false,
  },
} satisfies Meta<typeof KanbanBoardStateHarness>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: every column is empty and shows the empty state. */
export const EmptyColumns: Story = {
  args: {
    columns: [
      { id: 'new', title: 'New', items: [], count: 0 },
      { id: 'done', title: 'Done', items: [], count: 0 },
    ],
    emptyState: (
      <p className='p-3 text-xs text-secondary-token'>Nothing here</p>
    ),
  },
};

/** Partial: the count exceeds the items loaded so far. */
export const PartialMoreItemsThanLoaded: Story = {
  args: {
    columns: [
      {
        id: 'new',
        title: 'New',
        items: [{ id: '1', label: 'First card' }],
        count: 40,
      },
    ],
  },
};

/** Long content: a long card label and column title. */
export const LongContentCard: Story = {
  args: {
    columns: [
      {
        id: 'new',
        title: 'A column title that is much longer than the column itself',
        items: [
          {
            id: '1',
            label:
              'A card label that keeps going well past the width of the column to prove wrapping',
          },
        ],
        count: 1,
      },
    ],
  },
};

/** Rtl: the board in a right-to-left document. */
export const RtlBoard: Story = {
  args: {
    columns: [
      {
        id: 'new',
        title: 'جديد',
        items: [{ id: '1', label: 'بطاقة' }],
        count: 1,
      },
      { id: 'done', title: 'تم', items: [], count: 0 },
    ],
  },
  decorators: [
    function RtlFrame(Story) {
      return (
        <div dir='rtl'>
          <Story />
        </div>
      );
    },
  ],
};
