import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { AudienceTableHeader } from './AudienceTableHeader';

/**
 * State coverage for the audience table header. Same args as the canonical
 * Default story, rendered inside a table so the header row lays out as it
 * does in the audience workspace.
 */
const meta = {
  title:
    'Features/Dashboard/Audience/Table/Molecules/AudienceTableHeader States',
  component: AudienceTableHeader,
  parameters: {
    layout: 'centered',
  },
  args: {
    mode: 'members',
    sort: 'lastSeen',
    direction: 'desc',
    headerCheckboxState: false,
    selectedCount: 0,
    headerElevated: false,
    totalCount: 42,
    onSortChange: fn(),
    onToggleSelectAll: fn(),
    bulkActions: [],
  },
  render: args => (
    <table className='w-240'>
      <AudienceTableHeader {...args} />
    </table>
  ),
} satisfies Meta<typeof AudienceTableHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: an audience with nobody in it and no bulk actions. */
export const EmptyNoPeople: Story = {
  args: { totalCount: 0 },
};

/** Long content: a large audience, rows selected and many long bulk actions. */
export const LongContentBulkActions: Story = {
  args: {
    totalCount: 1284903,
    selectedCount: 318,
    headerCheckboxState: 'indeterminate',
    bulkActions: [
      { label: 'Export the selected people to CSV', onClick: fn() },
      { label: 'Add the selected people to a segment', onClick: fn() },
      { label: 'Tag the selected people for the next release', onClick: fn() },
      {
        label: 'Remove the selected people from this audience',
        onClick: fn(),
        disabled: true,
      },
    ],
  },
};

/** Right-to-left: subscriber headings inside an RTL table. */
export const RtlTable: Story = {
  args: { mode: 'subscribers', sort: 'email', totalCount: 7 },
  render: args => (
    <table dir='rtl' className='w-180'>
      <AudienceTableHeader {...args} />
    </table>
  ),
};
