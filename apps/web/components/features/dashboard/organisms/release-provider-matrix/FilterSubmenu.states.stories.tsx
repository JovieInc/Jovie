import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@jovie/ui';
import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { FilterSubmenu } from './FilterSubmenu';

const RELEASE_TYPE_OPTIONS = [
  { id: 'album', label: 'Album', iconName: 'Layers' },
  { id: 'ep', label: 'EP', iconName: 'Layers2' },
  { id: 'single', label: 'Single', iconName: 'Music' },
];

const LONG_LABEL_OPTIONS = [
  {
    id: 'northern',
    label:
      'Northern Coastline Recordings and Publishing International Holdings',
  },
  {
    id: 'republic',
    label: 'Republic of Extraordinarily Long Label Names Worldwide Group',
  },
  ...Array.from({ length: 16 }, (_, index) => ({
    id: `label-${index + 1}`,
    label: `Independent Label ${index + 1}`,
  })),
];

const withOpenMenu: Decorator = Story => (
  <DropdownMenu open>
    <DropdownMenuTrigger asChild>
      <button type='button' inert>
        Open filters
      </button>
    </DropdownMenuTrigger>
    <DropdownMenuContent>
      <Story />
    </DropdownMenuContent>
  </DropdownMenu>
);

const withRtlOpenMenu: Decorator = Story => (
  <div dir='rtl'>
    <DropdownMenu open dir='rtl'>
      <DropdownMenuTrigger asChild>
        <button type='button' inert>
          Open filters
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <Story />
      </DropdownMenuContent>
    </DropdownMenu>
  </div>
);

const page = () => within(document.body);

async function openSubmenu(label: string | RegExp) {
  await userEvent.click(await page().findByRole('menuitem', { name: label }));
}

const meta = {
  title: 'Dashboard/Releases/FilterSubmenu States',
  component: FilterSubmenu,
  args: {
    label: 'Release Type',
    iconName: 'Layers',
    options: RELEASE_TYPE_OPTIONS,
    selectedIds: ['album'],
    onToggle: fn(),
    counts: { album: 5, ep: 2, single: 11 },
  },
} satisfies Meta<typeof FilterSubmenu>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: a category with no options shows the empty row. */
export const EmptyNoOptions: Story = {
  args: { label: 'Label', iconName: 'Tag', options: [], selectedIds: [] },
  decorators: [withOpenMenu],
  play: async () => {
    await openSubmenu(/Label/);
    await expect(await page().findByText('No options found')).toBeVisible();
  },
};

/** Partial: no counts and no option icons, with the default placeholder. */
export const PartialNoCountsOrIcons: Story = {
  args: {
    options: RELEASE_TYPE_OPTIONS.map(({ id, label }) => ({ id, label })),
    selectedIds: [],
    counts: undefined,
  },
  decorators: [withOpenMenu],
  play: async () => {
    await openSubmenu(/Release Type/);
    await expect(await page().findByLabelText('Search...')).toBeVisible();
    await expect(
      page().getByRole('menuitemcheckbox', { name: /Album/ })
    ).toHaveAttribute('aria-checked', 'false');
  },
};

/** Long content: many options with long labels scroll inside the submenu. */
export const LongContentManyLongLabels: Story = {
  args: {
    label: 'Record label and publishing partner',
    iconName: 'Tag',
    options: LONG_LABEL_OPTIONS,
    selectedIds: ['northern', 'republic'],
    counts: { northern: 1280, republic: 4096 },
    searchPlaceholder: 'Search labels...',
  },
  decorators: [withOpenMenu],
  play: async () => {
    await openSubmenu(/Record label and publishing partner/);
    await expect(await page().findAllByRole('menuitemcheckbox')).toHaveLength(
      LONG_LABEL_OPTIONS.length
    );
  },
};

/** Right-to-left: the category row inside an RTL menu. */
export const RtlCategory: Story = {
  args: { label: 'نوع الإصدار' },
  decorators: [withRtlOpenMenu],
  play: async () => {
    await expect(
      await page().findByRole('menuitem', { name: /نوع الإصدار/ })
    ).toBeVisible();
  },
};
