import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { KanbanBoard } from './KanbanBoard';

const meta = {
  title: 'Features/Admin/Table/KanbanBoard',
  component: KanbanBoard,
  parameters: {
    layout: 'fullscreen',
    jovie: {
      uncoveredProps: ['emptyState', 'cardHeight', 'className'],
    },
  },
  decorators: [
    Story => (
      <div className='h-96 bg-base text-primary-token'>
        <Story />
      </div>
    ),
  ],
  args: {
    columns: [
      {
        id: 'new',
        title: 'New',
        items: [{ id: '1', label: 'First card' }],
        count: 1,
      },
      {
        id: 'done',
        title: 'Done',
        items: [],
        count: 0,
      },
    ],
    renderCard: (item: { id: string; label: string }) => <p>{item.label}</p>,
    getItemId: (item: { id: string }) => item.id,
    onItemMove: fn(),
    enableVirtualization: false,
  },
} satisfies Meta<typeof KanbanBoard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
