import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ReactNode } from 'react';
import { expect, fn, within } from 'storybook/test';
import { KanbanBoard, type KanbanBoardProps } from './KanbanBoard';

interface StoryItem {
  readonly id: string;
  readonly label: string;
}

function KanbanBoardStoryHarness(props: KanbanBoardProps<StoryItem>) {
  return <KanbanBoard {...props} />;
}

function BoardDecorator(Story: () => ReactNode) {
  return (
    <div className='h-96 bg-base text-primary-token'>
      <Story />
    </div>
  );
}

function RtlBoardDecorator(Story: () => ReactNode) {
  return (
    <div className='h-96 bg-base text-primary-token' dir='rtl'>
      <Story />
    </div>
  );
}

function renderCard(item: StoryItem) {
  return <p className='text-xs text-secondary-token'>{item.label}</p>;
}

function getItemId(item: StoryItem) {
  return item.id;
}

const LONG_TITLE = 'Waiting on a second fact review before the invite goes out';
const LONG_LABEL =
  'Aurelia Montgomery-Fitzgerald and the Extraordinarily Long Named Midnight Orchestra of Everywhere';

/** State coverage for the kanban board. */
const meta = {
  title: 'Features/Admin/Table/KanbanBoard States',
  component: KanbanBoardStoryHarness,
  parameters: { layout: 'fullscreen' },
  args: {
    columns: [],
    renderCard,
    getItemId,
    onItemMove: fn(),
    enableVirtualization: false,
  },
} satisfies Meta<typeof KanbanBoardStoryHarness>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: every column is empty and shows the caller's empty line. */
export const EmptyColumns: Story = {
  args: {
    columns: [
      { id: 'new', title: 'New', items: [], count: 0 },
      { id: 'invited', title: 'Invited', items: [], count: 0 },
    ],
    emptyState: 'Nothing here yet',
  },
  decorators: [BoardDecorator],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getAllByText('Nothing here yet')).toHaveLength(3);
  },
};

/** Partial: no accent, no empty line and no move handler; defaults apply. */
export const PartialDefaults: Story = {
  args: {
    columns: [
      {
        id: 'new',
        title: 'New',
        items: [{ id: '1', label: 'First card' }],
        count: 1,
      },
      { id: 'done', title: 'Done', items: [], count: 0 },
    ],
    onItemMove: undefined,
  },
  decorators: [BoardDecorator],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('No items')).toBeVisible();
    await expect(canvas.getByText('First card').closest('li')).toHaveAttribute(
      'draggable',
      'false'
    );
  },
};

/** Long content: long titles and labels, and more cards than fit a column. */
export const LongContentCards: Story = {
  args: {
    columns: [
      {
        id: 'review',
        title: LONG_TITLE,
        accent: 'var(--color-accent-purple-text)',
        items: [
          { id: 'long', label: LONG_LABEL },
          ...Array.from({ length: 8 }, (_, index) => ({
            id: `card-${index}`,
            label: `Card ${index + 1}`,
          })),
        ],
        count: 1280,
      },
      { id: 'done', title: 'Done', items: [], count: 0 },
    ],
  },
  decorators: [BoardDecorator],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole('heading', { name: LONG_TITLE })
    ).toBeVisible();
    await expect(canvas.getByText(LONG_LABEL)).toBeVisible();
    await expect(canvas.getByText('1280')).toBeVisible();
  },
};

/** Right-to-left: columns run from the right edge of an RTL document. */
export const RtlBoard: Story = {
  args: {
    columns: [
      {
        id: 'new',
        title: 'جديد',
        items: [{ id: '1', label: 'البطاقة الأولى' }],
        count: 1,
      },
      { id: 'done', title: 'تم', items: [], count: 0 },
    ],
  },
  decorators: [RtlBoardDecorator],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('heading', { name: 'جديد' })).toBeVisible();
    await expect(canvas.getByText('البطاقة الأولى')).toBeVisible();
  },
};
