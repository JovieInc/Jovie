import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fireEvent, within } from 'storybook/test';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from './context-menu';

const meta: Meta = {
  title: 'UI/Atoms/ContextMenu',
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
};
export default meta;
type Story = StoryObj;

export const Default: Story = {
  render: () => (
    <ContextMenu>
      <ContextMenuTrigger className='flex h-24 w-48 items-center justify-center rounded-md border border-subtle bg-surface-1 text-sm'>
        Right-click here
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem>Open</ContextMenuItem>
        <ContextMenuItem>Share</ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem disabled>Delete</ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  ),
};

export const EdgeCollision: Story = {
  parameters: { layout: 'fullscreen' },
  render: () => (
    <div className='flex min-h-56 items-end justify-end p-2'>
      <ContextMenu>
        <ContextMenuTrigger className='flex h-24 w-48 items-center justify-center rounded-md border border-subtle bg-surface-1 text-sm'>
          Right-click at the edge
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem>Open profile</ContextMenuItem>
          <ContextMenuItem>Copy email</ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem disabled>Remove</ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    </div>
  ),
};

const TRIGGER_CLASS =
  'flex h-24 w-48 items-center justify-center rounded-md border border-subtle bg-surface-1 p-3 text-center text-sm';

/** Context menus have no open prop; state stories open with a right-click. */
const openWithRightClick: Story['play'] = async ({ canvasElement }) => {
  const trigger = within(canvasElement).getByTestId(
    'context-menu-story-trigger'
  );
  await fireEvent.contextMenu(trigger);
};

export const Empty: Story = {
  render: () => (
    <ContextMenu>
      <ContextMenuTrigger
        className={TRIGGER_CLASS}
        data-testid='context-menu-story-trigger'
      >
        Right-click the playlist
      </ContextMenuTrigger>
      <ContextMenuContent className='w-56'>
        <ContextMenuLabel>Add to playlist</ContextMenuLabel>
        <ContextMenuItem disabled>No playlists yet</ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  ),
  play: openWithRightClick,
  parameters: {
    docs: {
      description: {
        story:
          'A context menu with no options shows a disabled placeholder row so the opened menu never renders as a blank surface.',
      },
    },
  },
};

export const Partial: Story = {
  render: () => (
    <ContextMenu>
      <ContextMenuTrigger
        className={TRIGGER_CLASS}
        data-testid='context-menu-story-trigger'
      >
        Right-click here
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem>Open</ContextMenuItem>
        <ContextMenuItem>Share</ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  ),
  play: openWithRightClick,
  parameters: {
    docs: {
      description: {
        story:
          'Bare items only, with the optional label, separators, shortcuts, inset and variant omitted.',
      },
    },
  },
};

export const LongContent: Story = {
  render: () => (
    <ContextMenu>
      <ContextMenuTrigger
        className={TRIGGER_CLASS}
        data-testid='context-menu-story-trigger'
      >
        Right-click the release card for every available action
      </ContextMenuTrigger>
      <ContextMenuContent className='w-56'>
        <ContextMenuLabel>
          Actions for the summer single and its extended club mix
        </ContextMenuLabel>
        <ContextMenuItem>
          Copy the smart link to share with playlist curators and press
        </ContextMenuItem>
        <ContextMenuItem>
          Open the release analytics for every territory and platform
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem variant='destructive'>
          Remove this release from the public profile permanently
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  ),
  play: openWithRightClick,
  parameters: {
    docs: {
      description: {
        story:
          'Long trigger, label and item text wrap inside fixed widths without horizontal overflow.',
      },
    },
  },
};

export const Rtl: Story = {
  render: () => (
    <div dir='rtl'>
      <ContextMenu dir='rtl'>
        <ContextMenuTrigger
          className={TRIGGER_CLASS}
          data-testid='context-menu-story-trigger'
        >
          انقر بزر الفأرة الأيمن على بطاقة الإصدار
        </ContextMenuTrigger>
        <ContextMenuContent className='w-56'>
          <ContextMenuLabel>إجراءات الإصدار</ContextMenuLabel>
          <ContextMenuItem>فتح صفحة الإصدار</ContextMenuItem>
          <ContextMenuItem>
            نسخ الرابط الذكي لمشاركته مع الجمهور وقوائم التشغيل
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem variant='destructive'>حذف الإصدار</ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    </div>
  ),
  play: openWithRightClick,
  parameters: {
    docs: {
      description: {
        story:
          'Right-to-left Arabic items align to the start edge and long rows wrap inside the menu width.',
      },
    },
  },
};
