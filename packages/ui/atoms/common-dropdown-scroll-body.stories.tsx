import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { CommonDropdown } from './common-dropdown';
import { MenuScrollBody } from './common-dropdown-scroll-body';
import type { CommonDropdownItem } from './common-dropdown-types';

/**
 * The scroll region behind `CommonDropdown`'s `scrollBody` prop: a
 * fixed-width list with the search pinned on top. Only the rows scroll, and
 * the list fades at whichever edge still hides rows. `motion="anchored"`
 * scales the panel from its trigger.
 */
const meta: Meta<typeof MenuScrollBody> = {
  title: 'UI/Atoms/CommonDropdown/Scroll Body',
  component: MenuScrollBody,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof MenuScrollBody>;

const TITLES = [
  'Spring Release Plan',
  'Tour Budget For The Fall Run',
  'Merch Drop Ideas',
  'Press Kit Rewrite',
  'Setlist For The Brooklyn Show',
  'Sync Licensing Pitch',
  'Remix Contest Rules',
  'Label Meeting Notes',
  'Top Fans By City',
  'Music Video Treatment',
  'Arts Grant Application',
  'Studio Budget',
  'Playlist Pitch Follow Ups',
  'Radio Edit Notes',
  'Album Rollout Calendar',
];

const longList: CommonDropdownItem[] = TITLES.map((label, index) => ({
  type: 'action',
  id: `row-${index}`,
  label,
  selected: index === 1,
  onClick: () => undefined,
}));

function ScrollBodyMenu({
  items,
  emptyMessage,
}: {
  readonly items: CommonDropdownItem[];
  readonly emptyMessage?: string;
}) {
  return (
    <CommonDropdown
      items={items}
      open
      modal={false}
      searchable
      searchPlaceholder='Search'
      scrollBody
      motion='anchored'
      maxHeight='20rem'
      emptyMessage={emptyMessage}
    />
  );
}

/** Long list: the bottom fades until you scroll to the end. */
export const LongList: Story = {
  render: () => <ScrollBodyMenu items={longList} />,
};

/** Short list: everything fits, so there is no fade. */
export const ShortList: Story = {
  render: () => <ScrollBodyMenu items={longList.slice(0, 3)} />,
};

/** Nothing to show: the empty message sits inside the list. */
export const Empty: Story = {
  render: () => <ScrollBodyMenu items={[]} emptyMessage='No Matching Items' />,
};
