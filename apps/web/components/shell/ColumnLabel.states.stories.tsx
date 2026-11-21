import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ReactNode } from 'react';
import { fn } from 'storybook/test';
import { ColumnLabel } from './ColumnLabel';

type Field = 'title' | 'artist' | 'releaseDate';

/** Rendered states of the sortable column label beyond the sort stories. */
const meta = {
  title: 'Shell/ColumnLabel/States',
  component: ColumnLabel<Field>,
  parameters: { layout: 'centered' },
  decorators: [
    function withHeaderFrame(StoryFn) {
      return <div className='w-48 bg-base p-4'>{StoryFn()}</div>;
    },
  ],
  args: {
    field: 'title',
    label: 'Title',
    align: 'left',
    sortBy: 'artist',
    sortDir: 'asc',
    onSort: fn(),
  },
} satisfies Meta<typeof ColumnLabel<Field>>;

export default meta;
type Story = StoryObj<typeof meta>;

function RtlFrame({ children }: Readonly<{ children: ReactNode }>) {
  return <div dir='rtl'>{children}</div>;
}

function withRtlFrame(StoryFn: () => ReactNode) {
  return <RtlFrame>{StoryFn()}</RtlFrame>;
}

/** Empty: the inactive column with an empty label keeps its sort affordance. */
export const EmptyLabel: Story = { args: { label: '' } };

/** Partial: only the required props, so no width, flex or default field. */
export const PartialRequiredProps: Story = {};

/** Long content: a long label inside a fixed-width column. */
export const LongContentFixedWidth: Story = {
  args: { label: 'Original release date', width: 'w-24', sortBy: 'title' },
};

/** Rtl: the right-aligned column mirrors in a right-to-left header. */
export const RtlRightAligned: Story = {
  args: { label: 'تاريخ الإصدار', align: 'right', sortBy: 'title' },
  decorators: [withRtlFrame],
};
