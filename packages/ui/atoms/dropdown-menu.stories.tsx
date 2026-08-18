import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Button } from './button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './dropdown-menu';

const meta: Meta = {
  title: 'UI/Atoms/DropdownMenu',
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
};
export default meta;
type Story = StoryObj;

export const Default: Story = {
  render: () => (
    <DropdownMenu defaultOpen>
      <DropdownMenuTrigger asChild>
        <Button variant='secondary'>Menu</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel>Actions</DropdownMenuLabel>
        <DropdownMenuItem>Edit</DropdownMenuItem>
        <DropdownMenuItem>Duplicate</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled>Archive</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  ),
};

export const EdgeCollision: Story = {
  parameters: { layout: 'fullscreen' },
  render: () => (
    <div className='flex min-h-48 items-start justify-end p-2'>
      <DropdownMenu defaultOpen>
        <DropdownMenuTrigger asChild>
          <Button variant='secondary'>Edge menu</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align='end'>
          <DropdownMenuLabel>Move contact</DropdownMenuLabel>
          <DropdownMenuItem>Audience</DropdownMenuItem>
          <DropdownMenuItem>Collaborators</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled>Archived</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  ),
};
