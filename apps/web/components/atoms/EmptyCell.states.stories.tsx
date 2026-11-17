import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { EmptyCell } from './EmptyCell';

/** Rendered states of the table empty marker, beside EmptyCell.stories.tsx. */
const meta = {
  title: 'Atoms/EmptyCell States',
  component: EmptyCell,
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof EmptyCell>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Partial: a missing value in a row whose other cells are filled. */
export const MissingValueInRow: Story = {
  render: args => (
    <table className='text-xs text-secondary-token'>
      <tbody>
        <tr>
          <td className='pr-4'>Midnight Drive</td>
          <td className='pr-4'>12,480 plays</td>
          <td>
            <EmptyCell {...args} />
          </td>
        </tr>
      </tbody>
    </table>
  ),
  args: {
    tooltip: 'No release date set',
  },
};

/** Long content: a long explanation in the tooltip. */
export const LongContentTooltip: Story = {
  args: {
    tooltip:
      'No release date set yet. Add one from the release settings so every service lists the same day.',
  },
};

/** Right-to-left: an Arabic tooltip on the same dash marker. */
export const RtlArabicTooltip: Story = {
  args: {
    tooltip: 'لم يتم تحديد تاريخ الإصدار',
  },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
};
