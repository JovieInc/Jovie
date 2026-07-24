import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import * as React from 'react';
import { Button } from './button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from './dropdown-menu';

const meta: Meta<typeof DropdownMenu> = {
  title: 'UI/Atoms/DropdownMenu',
  component: DropdownMenu,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'A menu of actions or options built on Radix DropdownMenu. Supports labels, separators, shortcuts, checkbox and radio items, submenus, and a destructive item tone.',
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    open: {
      control: { type: 'boolean' },
      description: 'Controls the open state of the menu',
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

// Basic menu opened via trigger
export const Default: Story = {
  render: () => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant='secondary'>Open menu</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className='w-56'>
        <DropdownMenuLabel>My Account</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem>
          Profile
          <DropdownMenuShortcut>⇧⌘P</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem>
          Billing
          <DropdownMenuShortcut>⌘B</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem>Settings</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem>Log out</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  ),
};

// Open state so Chromatic captures the menu surface
export const Open: Story = {
  render: () => (
    <DropdownMenu defaultOpen modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant='secondary'>Open menu</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className='w-56'>
        <DropdownMenuLabel>Release</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem>View analytics</DropdownMenuItem>
        <DropdownMenuItem>Edit smart link</DropdownMenuItem>
        <DropdownMenuItem>Copy share URL</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  ),
};

// Disabled and destructive item tones
export const DisabledAndDestructive: Story = {
  render: () => (
    <DropdownMenu defaultOpen modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant='secondary'>More actions</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className='w-56'>
        <DropdownMenuItem>Duplicate</DropdownMenuItem>
        <DropdownMenuItem disabled>Archive (Pro only)</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant='destructive'>
          Delete release
          <DropdownMenuShortcut>⌘⌫</DropdownMenuShortcut>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  ),
};

// Checkbox and radio items
export const WithCheckboxAndRadio: Story = {
  render: function CheckboxRadioStory() {
    const [showStatusBar, setShowStatusBar] = React.useState(true);
    const [showActivityBar, setShowActivityBar] = React.useState(false);
    const [panelPosition, setPanelPosition] = React.useState('bottom');

    return (
      <DropdownMenu defaultOpen modal={false}>
        <DropdownMenuTrigger asChild>
          <Button variant='secondary'>View options</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className='w-56'>
          <DropdownMenuLabel>Appearance</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuCheckboxItem
            checked={showStatusBar}
            onCheckedChange={setShowStatusBar}
          >
            Status bar
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem
            checked={showActivityBar}
            onCheckedChange={setShowActivityBar}
          >
            Activity bar
          </DropdownMenuCheckboxItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel>Panel position</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={panelPosition}
            onValueChange={setPanelPosition}
          >
            <DropdownMenuRadioItem value='top'>Top</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value='bottom'>Bottom</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value='right'>Right</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  },
};

// Submenu support
export const WithSubmenu: Story = {
  render: () => (
    <DropdownMenu defaultOpen modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant='secondary'>Share</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className='w-56'>
        <DropdownMenuItem>Copy link</DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Share to</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuItem>Instagram</DropdownMenuItem>
            <DropdownMenuItem>TikTok</DropdownMenuItem>
            <DropdownMenuItem>X / Twitter</DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem>Embed widget</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  ),
};

// Long item labels truncate inside a narrow menu
export const NarrowWithLongLabels: Story = {
  render: () => (
    <DropdownMenu defaultOpen modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant='secondary'>Releases</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className='w-44'>
        <DropdownMenuLabel>Recent releases</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem className='truncate'>
          Midnight Sessions (Deluxe Edition)
        </DropdownMenuItem>
        <DropdownMenuItem className='truncate'>
          Live at the Echo Chamber, Vol. II
        </DropdownMenuItem>
        <DropdownMenuItem className='truncate'>
          Acoustic B-Sides and Rarities
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  ),
};
