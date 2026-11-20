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
    <DropdownMenu defaultOpen modal={false}>
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
      <DropdownMenu defaultOpen modal={false}>
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

export const Empty: Story = {
  render: () => (
    <DropdownMenu defaultOpen modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant='secondary'>Saved views</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className='w-56'>
        <DropdownMenuLabel>Saved views</DropdownMenuLabel>
        <DropdownMenuItem disabled>No saved views yet</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'A menu with no options shows a disabled placeholder row so the open menu never renders as a blank surface.',
      },
    },
  },
};

export const Partial: Story = {
  render: () => (
    <DropdownMenu defaultOpen modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant='secondary'>Menu</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem>Edit</DropdownMenuItem>
        <DropdownMenuItem>Duplicate</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  ),
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
    <DropdownMenu defaultOpen modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant='secondary'>Move release</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className='w-56'>
        <DropdownMenuLabel>
          Move this release to another collection in your catalog
        </DropdownMenuLabel>
        <DropdownMenuItem>
          Summer singles and extended club mixes from the festival season
        </DropdownMenuItem>
        <DropdownMenuItem>
          Collaborations with featured artists and remix contest winners
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant='destructive'>
          Remove from every collection and hide from the public profile
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Long label and item text wrap inside a fixed-width menu without horizontal overflow.',
      },
    },
  },
};

export const Rtl: Story = {
  render: () => (
    <div dir='rtl'>
      <DropdownMenu defaultOpen modal={false} dir='rtl'>
        <DropdownMenuTrigger asChild>
          <Button variant='secondary'>الإجراءات</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className='w-56'>
          <DropdownMenuLabel>إجراءات الإصدار</DropdownMenuLabel>
          <DropdownMenuItem>تعديل تفاصيل الإصدار والغلاف</DropdownMenuItem>
          <DropdownMenuItem>
            نسخ الرابط الذكي لمشاركته مع الجمهور وقوائم التشغيل
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant='destructive'>حذف الإصدار</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Right-to-left Arabic items align to the start edge and long rows wrap inside the menu width.',
      },
    },
  },
};
