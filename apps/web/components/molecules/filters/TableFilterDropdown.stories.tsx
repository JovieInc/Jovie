import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type {
  TableFilterDropdownCategory,
  TableFilterDropdownProps,
} from './TableFilterDropdown';
import { TableFilterDropdown } from './TableFilterDropdown';

type FilterId =
  | 'active'
  | 'draft'
  | 'released'
  | 'spotify'
  | 'apple_music'
  | 'youtube'
  | 'soundcloud';

const TypedTableFilterDropdown: (
  props: TableFilterDropdownProps<FilterId>
) => React.JSX.Element = TableFilterDropdown;

const categories: readonly TableFilterDropdownCategory<FilterId>[] = [
  {
    id: 'status',
    label: 'Status',
    iconName: 'Hash',
    selectedIds: ['active'],
    onToggle: () => undefined,
    options: [
      { id: 'active', label: 'Active', count: 12 },
      { id: 'draft', label: 'Draft', count: 3 },
      { id: 'released', label: 'Released', count: 28 },
    ],
  },
  {
    id: 'provider',
    label: 'Provider',
    iconName: 'Globe',
    selectedIds: [],
    onToggle: () => undefined,
    options: [
      { id: 'spotify', label: 'Spotify', count: 20 },
      { id: 'apple_music', label: 'Apple Music', count: 18 },
      { id: 'youtube', label: 'YouTube', count: 14 },
      { id: 'soundcloud', label: 'SoundCloud', count: 6 },
    ],
  },
];

const meta = {
  title: 'Molecules/Filters/TableFilterDropdown',
  component: TypedTableFilterDropdown,
  parameters: {
    layout: 'centered',
  },
  args: {
    categories,
    headerLabel: 'Filter Releases',
  },
} satisfies Meta<typeof TypedTableFilterDropdown>;

export default meta;
type Story = StoryObj<typeof meta>;

// The trigger is a controlled Radix DropdownMenu with no defaultOpen API;
// open it with a real pointer interaction so menu content is visible.
const openMenu: Story['play'] = async ({ canvasElement }) => {
  const trigger = canvasElement.querySelector<HTMLButtonElement>(
    'button[aria-pressed]'
  );
  trigger?.dispatchEvent(
    new PointerEvent('pointerdown', {
      bubbles: true,
      button: 0,
      ctrlKey: false,
      pointerType: 'mouse',
    })
  );
};

export const Default: Story = {
  render: args => <TableFilterDropdown {...args} />,
  play: openMenu,
};

export const Empty: Story = {
  args: {
    categories: [],
    emptyMessage: 'No filters found',
  },
  render: args => <TableFilterDropdown {...args} />,
  play: openMenu,
};
