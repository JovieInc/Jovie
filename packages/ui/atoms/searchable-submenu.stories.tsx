import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Button } from './button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './dropdown-menu';
import type {
  SearchableSubmenuItem,
  SearchableSubmenuSection,
} from './searchable-submenu';
import { SearchableList, SearchableSubmenu } from './searchable-submenu';

const meta: Meta<typeof SearchableSubmenu> = {
  title: 'UI/Atoms/SearchableSubmenu',
  component: SearchableSubmenu,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'A dropdown/context-menu submenu with an integrated search field that filters as you type, plus a standalone SearchableList variant for popovers and modals. Supports sections, badges, shortcuts, disabled items, loading, and empty states.',
      },
    },
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

const genreSections: SearchableSubmenuSection[] = [
  {
    id: 'popular',
    label: 'Popular',
    items: [
      { id: 'pop', label: 'Pop', badge: '128' },
      {
        id: 'hip-hop',
        label: 'Hip-Hop',
        description: 'Rap, trap, and drill',
        badge: '96',
      },
      { id: 'electronic', label: 'Electronic', shortcut: '⌘E' },
    ],
  },
  {
    id: 'more',
    label: 'More genres',
    items: [
      { id: 'jazz', label: 'Jazz', description: 'Classic and modern' },
      { id: 'ambient', label: 'Ambient', description: 'Atmospheric textures' },
      { id: 'classical', label: 'Classical', disabled: true },
    ],
  },
];

const listItems: SearchableSubmenuItem[] = genreSections.flatMap(
  section => section.items
);

const noop = () => {};

const listSurfaceClasses =
  'w-72 rounded-lg border border-subtle bg-surface-0 shadow-md';

// Submenu inside an open dropdown menu (submenu itself is closed)
export const Default: Story = {
  render: () => (
    <DropdownMenu defaultOpen modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant='secondary'>Tag release</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className='w-56'>
        <DropdownMenuItem>Edit metadata</DropdownMenuItem>
        <SearchableSubmenu
          triggerLabel='Add genre'
          sections={genreSections}
          onSelect={noop}
          searchPlaceholder='Search genres...'
        />
        <DropdownMenuItem>View analytics</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  ),
};

// Disabled submenu trigger
export const Disabled: Story = {
  render: () => (
    <DropdownMenu defaultOpen modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant='secondary'>Tag release</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className='w-56'>
        <DropdownMenuItem>Edit metadata</DropdownMenuItem>
        <SearchableSubmenu
          triggerLabel='Add genre (Pro only)'
          sections={genreSections}
          onSelect={noop}
          disabled
        />
      </DropdownMenuContent>
    </DropdownMenu>
  ),
};

// Standalone SearchableList with sections flattened, badges, and a footer
export const ListWithFooter: Story = {
  render: () => (
    <div className={listSurfaceClasses}>
      <SearchableList
        items={listItems}
        onSelect={noop}
        searchPlaceholder='Search genres...'
        footer={
          <div className='p-1.5'>
            <Button variant='ghost' size='sm' className='w-full justify-start'>
              Create custom genre…
            </Button>
          </div>
        }
      />
    </div>
  ),
};

// Empty state when no items match
export const ListEmpty: Story = {
  render: () => (
    <div className={listSurfaceClasses}>
      <SearchableList
        items={[]}
        onSelect={noop}
        searchPlaceholder='Search genres...'
        emptyMessage='No genres found'
      />
    </div>
  ),
};

// Long labels and descriptions inside a narrow container
export const ListNarrowWithLongContent: Story = {
  render: () => (
    <div className='w-56 rounded-lg border border-subtle bg-surface-0 shadow-md'>
      <SearchableList
        items={[
          {
            id: 'long-1',
            label: 'Progressive Psychedelic Trance',
            description: 'A very long description that should truncate nicely',
          },
          {
            id: 'long-2',
            label: 'Experimental Post-Industrial Ambient',
            badge: '12',
          },
          {
            id: 'long-3',
            label: 'Lo-Fi Hip-Hop Beats to Study/Relax to',
            shortcut: '⌘L',
          },
        ]}
        onSelect={noop}
        searchPlaceholder='Search...'
      />
    </div>
  ),
};
