import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { OutboundNameCell } from './OutboundNameCell';
import { outboundFixtureRow } from './outbound-fixtures';

const meta = {
  title: 'Features/Admin/Outbound/OutboundNameCell/States',
  component: OutboundNameCell,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof OutboundNameCell>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: a row with no flags, holds or notes shows only the name and handle. */
export const EmptyNoTags: Story = {
  args: { row: outboundFixtureRow() },
};

/** Long content: a long name, handle and relationship note truncate. */
export const LongContentTruncation: Story = {
  args: {
    row: outboundFixtureRow({
      name: 'Alexandria Montgomery-Featherstonehaugh of the Long Island Sound',
      handle: 'alexandriamontgomeryfeatherstonehaughofthelongislandsound',
      relationshipNotes: [
        'Relationship: Armada Music, long-running vocalist deals and remix packages',
      ],
      flags: ['possible_non_artist'],
    }),
  },
};

/** Right-to-left: an Arabic name in an RTL row. */
export const RtlName: Story = {
  args: { row: outboundFixtureRow({ name: 'عبد الله', handle: 'abdullah' }) },
  decorators: [
    function RtlDecorator(Story) {
      return (
        <div dir='rtl'>
          <Story />
        </div>
      );
    },
  ],
};
