import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, within } from 'storybook/test';
import type { AudienceAction } from '@/types';
import { AudienceActionsCell } from './AudienceActionsCell';

const actions: AudienceAction[] = [
  { label: 'Clicked Spotify link' },
  { label: 'Tipped $5' },
  { label: 'Followed on Instagram' },
  { label: 'Viewed profile' },
  { label: 'Subscribed to drops' },
];

/** State coverage for the recent-actions icon strip. */
const meta = {
  title: 'Organisms/Table/Atoms/AudienceActionsCell States',
  component: AudienceActionsCell,
  parameters: {
    layout: 'centered',
  },
  args: {
    rowId: 'row-1',
    actions,
  },
} satisfies Meta<typeof AudienceActionsCell>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Partial: actions with blank labels fall back to "Unknown action". */
export const PartialUnlabeledActions: Story = {
  args: {
    actions: [{ label: '' }, { label: '   ' }, { label: 'Tipped $5' }],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getAllByText('Unknown action')).toHaveLength(2);
  },
};

/** Long content: more actions than the cell shows, with long labels. */
export const LongContentManyActions: Story = {
  args: {
    actions: [
      ...actions,
      { label: 'Clicked a very long merch link for the summer tour bundle' },
    ],
    maxActions: 4,
  },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelectorAll('[title]')).toHaveLength(4);
  },
};

/** Right-to-left: the strip inside an RTL document. */
export const RtlActions: Story = {
  args: {
    actions: [{ label: 'نقر على رابط Spotify' }, { label: 'Tipped $5' }],
  },
  decorators: [
    function RtlDocument(Story) {
      return (
        <div dir='rtl'>
          <Story />
        </div>
      );
    },
  ],
};
