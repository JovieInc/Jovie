import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { AudienceRowSelectionCell } from './AudienceRowSelectionCell';

/** State coverage for the audience row number and selection checkbox. */
const meta = {
  title: 'Organisms/Table/Atoms/AudienceRowSelectionCell States',
  component: AudienceRowSelectionCell,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    function HoverGroup(Story) {
      return (
        <div className='group w-12'>
          <Story />
        </div>
      );
    },
  ],
  args: {
    rowNumber: 1,
    isChecked: false,
    displayName: 'Ada Lovelace',
    onToggle: fn(),
  },
} satisfies Meta<typeof AudienceRowSelectionCell>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: a member with no display name gets the generic row label. */
export const EmptyDisplayName: Story = {
  args: {
    displayName: null,
  },
  play: async ({ args, canvasElement }) => {
    const checkbox = within(canvasElement).getByRole('checkbox', {
      name: 'Select row',
    });
    await userEvent.click(checkbox);
    await expect(args.onToggle).toHaveBeenCalledTimes(1);
  },
};

/** Long content: a five-digit row number in the fixed-width slot. */
export const LongContentRowNumber: Story = {
  args: {
    rowNumber: 10_482,
    displayName:
      'Alexandria Montgomery-Fitzgerald of the Northern Coast Fan Club',
  },
};

/** Right-to-left: an Arabic member name inside an RTL document. */
export const RtlSelection: Story = {
  args: {
    displayName: 'ليلى',
    isChecked: true,
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
