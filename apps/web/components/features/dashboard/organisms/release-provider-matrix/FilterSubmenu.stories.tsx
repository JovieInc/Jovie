import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@jovie/ui';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { FilterSubmenu } from './FilterSubmenu';

const RELEASE_TYPE_OPTIONS = [
  { id: 'album', label: 'Album', iconName: 'Layers' },
  { id: 'ep', label: 'EP', iconName: 'Layers2' },
  { id: 'single', label: 'Single', iconName: 'Music' },
];

const meta = {
  title: 'Dashboard/Releases/FilterSubmenu',
  component: FilterSubmenu,
  args: {
    label: 'Release Type',
    iconName: 'Layers',
    options: RELEASE_TYPE_OPTIONS,
    selectedIds: ['album'],
    onToggle: fn(),
    counts: { album: 5, ep: 2, single: 11 },
  },
  decorators: [
    Story => (
      <DropdownMenu open>
        <DropdownMenuTrigger asChild>
          <button type='button'>Open filters</button>
        </DropdownMenuTrigger>
        <DropdownMenuContent open>
          <Story />
        </DropdownMenuContent>
      </DropdownMenu>
    ),
  ],
} satisfies Meta<typeof FilterSubmenu>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const NoSelection: Story = {
  args: {
    selectedIds: [],
  },
};
