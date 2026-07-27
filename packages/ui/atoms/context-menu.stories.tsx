import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import * as React from 'react';
import {
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from './context-menu';

const meta: Meta<typeof ContextMenu> = {
  title: 'UI/Atoms/ContextMenu',
  component: ContextMenu,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'A right-click menu built on Radix ContextMenu. The trigger is an arbitrary region — the menu opens at the pointer position on right-click (or the keyboard menu key).',
      },
    },
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

const triggerClasses =
  'flex h-32 w-64 items-center justify-center rounded-md border border-dashed border-subtle text-sm text-secondary-token';

/**
 * Radix ContextMenu has no `open`/`defaultOpen` prop — it only opens in
 * response to a native `contextmenu` event. This helper dispatches that
 * event on the trigger after mount so stories (and Chromatic) capture the
 * open menu.
 */
function OpenContextMenu({ children }: { readonly children: React.ReactNode }) {
  const triggerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    trigger.dispatchEvent(
      new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        clientX: rect.left + 8,
        clientY: rect.top + 8,
      })
    );
  }, []);

  return (
    <ContextMenu modal={false}>
      <ContextMenuTrigger asChild>
        <div ref={triggerRef} className={triggerClasses}>
          Right-click here
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>{children}</ContextMenuContent>
    </ContextMenu>
  );
}

// Closed state: the trigger region with instructions
export const Default: Story = {
  render: () => (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div className={triggerClasses}>Right-click here</div>
      </ContextMenuTrigger>
      <ContextMenuContent className='w-56'>
        <ContextMenuItem>Edit</ContextMenuItem>
        <ContextMenuItem>Duplicate</ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem variant='destructive'>Delete</ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  ),
};

// Open state with items, shortcuts, and a destructive action
export const Open: Story = {
  render: () => (
    <OpenContextMenu>
      <ContextMenuLabel>Track actions</ContextMenuLabel>
      <ContextMenuSeparator />
      <ContextMenuItem>
        Play
        <ContextMenuShortcut>⏎</ContextMenuShortcut>
      </ContextMenuItem>
      <ContextMenuItem>
        Add to queue
        <ContextMenuShortcut>⌘Q</ContextMenuShortcut>
      </ContextMenuItem>
      <ContextMenuItem disabled>Download (offline only)</ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem variant='destructive'>
        Remove from library
        <ContextMenuShortcut>⌘⌫</ContextMenuShortcut>
      </ContextMenuItem>
    </OpenContextMenu>
  ),
};

// Open state with checkbox and radio items
export const WithCheckboxAndRadio: Story = {
  render: function CheckboxRadioStory() {
    const [showWaveform, setShowWaveform] = React.useState(true);
    const [sortOrder, setSortOrder] = React.useState('recent');

    return (
      <OpenContextMenu>
        <ContextMenuLabel>Library view</ContextMenuLabel>
        <ContextMenuSeparator />
        <ContextMenuCheckboxItem
          checked={showWaveform}
          onCheckedChange={setShowWaveform}
        >
          Show waveform
        </ContextMenuCheckboxItem>
        <ContextMenuSeparator />
        <ContextMenuRadioGroup value={sortOrder} onValueChange={setSortOrder}>
          <ContextMenuRadioItem value='recent'>
            Most recent
          </ContextMenuRadioItem>
          <ContextMenuRadioItem value='plays'>Most plays</ContextMenuRadioItem>
          <ContextMenuRadioItem value='alpha'>A–Z</ContextMenuRadioItem>
        </ContextMenuRadioGroup>
      </OpenContextMenu>
    );
  },
};

// Open state with a submenu
export const WithSubmenu: Story = {
  render: () => (
    <OpenContextMenu>
      <ContextMenuItem>Play next</ContextMenuItem>
      <ContextMenuSub>
        <ContextMenuSubTrigger>Add to playlist</ContextMenuSubTrigger>
        <ContextMenuSubContent>
          <ContextMenuItem>New playlist</ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem>Road trip</ContextMenuItem>
          <ContextMenuItem>Studio refs</ContextMenuItem>
        </ContextMenuSubContent>
      </ContextMenuSub>
      <ContextMenuSeparator />
      <ContextMenuItem>Share track</ContextMenuItem>
    </OpenContextMenu>
  ),
};
