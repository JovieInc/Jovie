import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { SortableHeaderButton } from './SortableHeaderButton';

/**
 * State coverage for the sortable column header. Each story changes only the
 * label, the sort direction or the document direction.
 */
const meta = {
  title: 'Organisms/Table/SortableHeaderButton States',
  component: SortableHeaderButton,
  parameters: {
    layout: 'centered',
  },
  args: {
    label: 'Release Date',
    onClick: fn(),
  },
} satisfies Meta<typeof SortableHeaderButton>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Partial: no direction yet, so the neutral both-ways indicator shows. */
export const PartialUnsorted: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const button = canvas.getByRole('button', { name: 'Release Date' });
    await expect(button).toHaveTextContent('⇅');
    await userEvent.click(button);
    await expect(args.onClick).toHaveBeenCalledTimes(1);
  },
};

/** Long content: a long label truncates inside a narrow column. */
export const LongContentLabel: Story = {
  args: {
    label: 'Most recent distribution delivery date across every provider',
    direction: 'desc',
  },
  decorators: [
    function NarrowColumn(Story) {
      return (
        <div className='w-40'>
          <Story />
        </div>
      );
    },
  ],
};

/** Right-to-left: an Arabic label inside an RTL document. */
export const RtlLabel: Story = {
  args: {
    label: 'تاريخ الإصدار',
    direction: 'asc',
  },
  decorators: [
    function RtlDocument(Story) {
      return (
        <div dir='rtl' className='w-48'>
          <Story />
        </div>
      );
    },
  ],
};
