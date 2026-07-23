import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
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
