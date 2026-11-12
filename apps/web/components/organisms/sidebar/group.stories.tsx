import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { SidebarProvider } from './context';
import {
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
} from './group';

const meta = {
  title: 'Organisms/Sidebar/group',
  component: SidebarGroup,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <SidebarProvider>
        <div className='w-64 bg-surface-0 p-2'>
          <Story />
        </div>
      </SidebarProvider>
    ),
  ],
} satisfies Meta<typeof SidebarGroup>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <SidebarGroup>
      <SidebarGroupLabel>Library</SidebarGroupLabel>
      <SidebarGroupContent>
        <p className='px-2.5 text-sm text-secondary-token'>Group content</p>
      </SidebarGroupContent>
    </SidebarGroup>
  ),
};

export const WithAction: Story = {
  render: () => (
    <SidebarGroup>
      <SidebarGroupLabel>Playlists</SidebarGroupLabel>
      <SidebarGroupAction aria-label='Add playlist'>+</SidebarGroupAction>
      <SidebarGroupContent>
        <p className='px-2.5 text-sm text-secondary-token'>Group content</p>
      </SidebarGroupContent>
    </SidebarGroup>
  ),
};

/** A section whose collection is empty keeps its label and a quiet line. */
export const EmptyGroup: Story = {
  render: () => (
    <SidebarGroup>
      <SidebarGroupLabel>Playlists</SidebarGroupLabel>
      <SidebarGroupAction aria-label='Add playlist'>+</SidebarGroupAction>
      <SidebarGroupContent>
        <p className='px-2.5 text-sm text-tertiary-token'>No playlists yet</p>
      </SidebarGroupContent>
    </SidebarGroup>
  ),
};

/** A group without a label or action: content alone. */
export const PartialContentOnly: Story = {
  render: () => (
    <SidebarGroup>
      <SidebarGroupContent>
        <p className='px-2.5 text-sm text-secondary-token'>Group content</p>
      </SidebarGroupContent>
    </SidebarGroup>
  ),
};

export const LongContentLabel: Story = {
  render: () => (
    <SidebarGroup>
      <SidebarGroupLabel>
        <span className='truncate'>
          Playlists for The Extraordinarily Long Album Title (Deluxe Anniversary
          Remastered Edition)
        </span>
      </SidebarGroupLabel>
      <SidebarGroupAction aria-label='Add playlist'>+</SidebarGroupAction>
      <SidebarGroupContent>
        <p className='px-2.5 text-sm text-secondary-token break-words'>
          A collaborative playlist with an unusually long description that wraps
          across several lines in the rail.
        </p>
      </SidebarGroupContent>
    </SidebarGroup>
  ),
};

export const RtlGroup: Story = {
  render: () => (
    <div dir='rtl' lang='ar'>
      <SidebarGroup>
        <SidebarGroupLabel>قوائم التشغيل</SidebarGroupLabel>
        <SidebarGroupAction aria-label='إضافة قائمة تشغيل'>
          +
        </SidebarGroupAction>
        <SidebarGroupContent>
          <p className='px-2.5 text-sm text-secondary-token'>محتوى المجموعة</p>
        </SidebarGroupContent>
      </SidebarGroup>
    </div>
  ),
};
